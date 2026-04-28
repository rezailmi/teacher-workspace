# Testing Patterns

**Analysis Date:** 2026-04-28

## Test Framework

**Frontend:** Vitest 4 + React Testing Library 16 + jsdom 29 (`package.json`: `"vitest": "^4.1.5"`, `"@testing-library/react": "^16.3.2"`, `"jsdom": "^29.0.2"`, `"@testing-library/jest-dom": "^6.9.1"`). Config in `vitest.config.ts` merges `vite.config.ts` and adds:

```ts
test: {
  environment: 'jsdom',
  globals: true,
  setupFiles: ['./web/test/setup.ts'],
  include: ['web/**/*.{test,spec}.{ts,tsx}'],
}
```

`web/test/setup.ts` registers `@testing-library/jest-dom/vitest` matchers and runs `cleanup()` after each test. `tsconfig.app.json` includes `vitest/globals` and `@testing-library/jest-dom` types.

**Backend:** Go standard `testing` package, table-driven subtests via `t.Run`. Custom assertion helpers live in `server/pkg/require/require.go` (typed `Equal`, `NotEqual`, `True`, `False`, `NoError`, `HasError`, `EqualBytes`, plus `*f` variants). All call `t.Helper()` and use `t.Fatalf(...)` formatted as `"\nwant: %v\n got: %v"` — directly mirroring the want/got style mandated in `CLAUDE.md`.

**Run Commands:**

```bash
pnpm test          # frontend single run (CI) — vitest run
pnpm test:watch    # frontend watch mode
go test ./...      # backend, all packages
go test ./server/internal/handler           # one package
go test -run TestRequestOTP_Timeout ./server/internal/handler  # one test
golangci-lint run  # static analysis
```

## Test File Organization

**Frontend:** colocated `*.test.ts` / `*.test.tsx` next to source. Examples: `web/api/mappers.test.ts`, `web/components/posts/SchedulePickerDialog.test.tsx`, `web/hooks/useAutoSave.test.tsx`, `web/data/mock-pg-announcements.test.ts`. There are 14 test files across `web/api`, `web/containers`, `web/components`, `web/helpers`, `web/hooks`, `web/lib`, `web/data`. No `__tests__` directories in use today, though the convention permits them.

**Backend:** `*_test.go` colocated with sources (10 files): `server/internal/handler/{otp,index,helpers,handler}_test.go`, `server/internal/middleware/{request_id,middleware}_test.go`, `server/internal/pg/mock_files_test.go`, `server/internal/htmlutil/executor_test.go`, `server/pkg/dotenv/{dotenv,parser}_test.go`.

## Test Structure

**Frontend** — `describe` carries the unit under test; `it` describes the observable outcome (from `web/api/mappers.test.ts`):

```ts
describe('toPGCreatePayload', () => {
  it('builds a write payload from a complete input', () => {
    const out = toPGCreatePayload(basePayload);
    expect(out.title).toBe('Test');
    expect(out.targets).toEqual([]);
  });

  it('throws when enquiryEmailAddress is missing and allowPartial is not set', () => {
    const payload = { ...basePayload, enquiryEmailAddress: '' };
    expect(() => toPGCreatePayload(payload)).toThrow(/enquiryEmailAddress is required/i);
  });
});
```

A module-level `basePayload` provides shared baseline data; each test spreads `{ ...basePayload, override }` rather than rebuilding from scratch.

**Backend** — parent `Test<Func>` + `t.Run(...)` subtests, with the verb context on the parent name and the distinguishing trait on each subtest (from `server/internal/middleware/middleware_test.go`):

```go
func TestChain(t *testing.T) {
    t.Run("applies middleware in order around the handler", func(t *testing.T) {
        ...
        require.Equal(t, http.StatusOK, res.StatusCode)
        require.Equal(t, "m1-before,m2-before,handler,m2-after,m1-after", strings.Join(calls, ","))
    })

    t.Run("calls handler directly when no middleware is given", func(t *testing.T) {
        ...
    })
}
```

Small pure-function tests skip subtests entirely when there is only one outcome (`server/internal/handler/otp_test.go`'s `TestRequestOTP_*` series uses a flat `Test<Func>_<Scenario>` style).

## Naming

Outcome-first, optionally followed by scenario — matches `CLAUDE.md`. Real examples:

- FE: `'returns null for null or empty codes (the common happy path)'`, `'falls back to a generic apology for unknown codes'`, `'rejects with PGTimeoutError when fetch never resolves within the budget'`.
- BE: `'applies middleware in order around the handler'`, `'mints monotonically increasing ids across calls'`.

Go also uses flat function names in the form `TestFunc_Scenario` for handler tests (e.g. `TestRequestOTP_Timeout`, `TestVerifyOTP_MissingPin`).

## Assertions

**Backend** — `want/got` everywhere. Helpers in `server/pkg/require` format failures as `\nwant: %v\n got: %v`. Inline `if` initialisers used when capturing both:

```go
if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
    t.Fatalf("want nil, got: %v", err)
}
if resp.AttachmentID <= 10_000 {
    t.Errorf("want attachmentId > 10000, got: %d", resp.AttachmentID)
}
if !strings.Contains(resp.PresignedURL, "/api/files/2/mockUpload?attachmentId=") {
    t.Errorf("want presignedUrl containing mockUpload path, got: %q", resp.PresignedURL)
}
```

Use `t.Fatalf` when a later assertion would crash on the failure; `t.Errorf` when the test can keep accumulating signal.

**Frontend** — Vitest `expect` chains. `toEqual` for full equality, `toMatchObject` for partial-shape checks, `toMatch(/regex/)` for URL/path assertions on captured `fetch` calls, `toThrow(/regex/i)` for thrown messages, `resolves`/`rejects.toBeInstanceOf(...)` for promise outcomes.

## Mocking

**Frontend** uses Vitest's `vi.fn()` and `vi.stubGlobal('fetch', ...)`. Each test owns its mock; `beforeEach`/`afterEach` install and `vi.unstubAllGlobals()` cleans up (from `web/api/client.test.ts`):

```ts
function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch({ body: { announcementDraftId: 42 }, resultCode: 1 }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});
```

Multi-step flows use `mockResolvedValueOnce(...)` chains to script each call (CSRF retry test scripts three responses in a row). Fake timers (`vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync(200)`) drive `PGTimeoutError` paths without real waits.

**Backend** stubs `http.RoundTripper` with a function adapter (from `server/internal/handler/otp_test.go`):

```go
type RoundTripperFunc func(*http.Request) (*http.Response, error)
func (f RoundTripperFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

rt := RoundTripperFunc(func(req *http.Request) (*http.Response, error) {
    return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(bytes.NewReader([]byte(`{"id":"123"}`)))}, nil
})
h := &Handler{cfg: config.Default(), client: &http.Client{Transport: rt}}
```

For more complex setups handlers also use stub interfaces (`stubExecutor`, `errorExecutor` in `handler_test.go`). Mock PG mode itself is wired in `server/internal/pg/mock.go` and exercised end-to-end via `server/internal/pg/mock_files_test.go` using `httptest.NewRecorder()` and a freshly-mounted `http.ServeMux`.

## Fixtures

**Backend mock fixtures** live at `server/internal/pg/fixtures/*.json` (40 files: `announcement_detail*.json`, `consent_form_detail*.json`, `meetings.json`, `school_*.json`, `feature_flags.json`, etc.). Embedded via `//go:embed fixtures` in `server/internal/pg/mock.go` and dispatched by ID maps:

```go
//go:embed fixtures
var fixtures embed.FS

var announcementDetailByID = map[string]string{
    "1036": "fixtures/announcement_detail.json",            // POSTED view-only
    "1037": "fixtures/announcement_detail_yes_no.json",     // POSTED yes/no
    "1038": "fixtures/announcement_detail_scheduled.json",  // SCHEDULED
    "1039": "fixtures/announcement_detail_draft.json",      // DRAFT
}
```

Used by both the BFF in mock mode (`TW_PG_MOCK=true`) and indirectly by the FE during `pnpm dev`. Adding a new status is a one-line map edit; unknown IDs return 404.

**Frontend fixtures** are inline TypeScript literals — module-level `base*` objects (e.g. `baseAnnouncementSummary`, `baseConsentFormDetail` in `web/api/mappers.test.ts`) that tests spread into per-case overrides.

## Coverage

No coverage threshold is enforced in `vitest.config.ts` or `package.json`, and there's no Go coverage gate in `.golangci.yaml`. Coverage is opt-in (`go test -cover`, `vitest --coverage`); not currently part of CI gates that surface in this repo.

## Test Types

- **Unit** — dominant. Mappers (`mapAnnouncementSummary`, `toPGCreatePayload`), helpers (`buildTimeSlots`, `parsePostId`, `describeScheduledSendFailure`), reducers (`CreatePostView.reducer.test.ts`).
- **Integration** — present at the BFF boundary. `mock_files_test.go` mounts the real `registerMockFiles` mux and POSTs multipart bodies through it; `client.test.ts` exercises full `mutateApi` flows including CSRF retry, redirect handling, and timeout paths. Handler tests stand up a `*Handler` with a stub `RoundTripper` and exercise `RequestOTP` / `VerifyOTP` end-to-end.
- **Component** — React Testing Library renders (`SchedulePickerDialog.test.tsx`, `PostsView.test.tsx`, `RichTextToolbar.test.tsx`) using `render`, `screen`, and `vi.fn()` for callbacks.
- **E2E** — none in repo.

## Common Patterns

**Capturing fetch calls** to assert URL, method, body (`web/api/client.test.ts`):

```ts
const call = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
expect(call[0]).toMatch(/\/announcements\/drafts\/123$/);
expect(call[1].method).toBe('PUT');
expect(JSON.parse(call[1].body as string)).toEqual({ scheduledSendAt: '...' });
```

**Fake timers for timeout paths** — capture the rejection assertion _before_ advancing time so it's awaited in the right order:

```ts
const pending = createDraft(base, { timeoutMs: 100 });
const assertion = expect(pending).rejects.toBeInstanceOf(PGTimeoutError);
await vi.advanceTimersByTimeAsync(200);
await assertion;
```

**Go HTTP testing** — `httptest.NewRequest` + `httptest.NewRecorder` on every handler test; `req.AddCookie`, `rec.Result()`, `rec.Body.String()` cover the common assertions. The `require` helpers keep failure messages uniform.

**Type-only test imports** are written with `import type { ... }` (enforced by `verbatimModuleSyntax`).

---

_Testing analysis: 2026-04-28_
