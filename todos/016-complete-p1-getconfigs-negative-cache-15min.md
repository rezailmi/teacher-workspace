---
status: complete
priority: p1
issue_id: 016
tags: [code-review, races, reliability]
dependencies: []
---

# `getConfigs()` pins an error response for 15 minutes

## Problem Statement

The module-scope `getConfigs()` memoises the fetch promise with a 15-minute TTL. On success that's fine — we avoid re-fetching per route. But on failure, the `.catch(() => EMPTY_CONFIG)` stores an all-flags-off result in the same cache slot, pinned for 15 minutes. Consequence: any transient `/api/configs` failure (PG restart, network blip) silently hides schedule-send, shortcuts, and duplicate for the next 15 minutes across the whole session — and there's no signal to the user or to devtools that a feature is "off because of error" vs "off because PG disabled it". A user who hit a single flaky `/configs` response on page load loses 15 minutes of flag-gated UI with no recovery path besides a full reload.

## Findings

**julik-frontend-races-reviewer:**

> `fetchApiRoot` (not `fetchApiSafe`) is used, and `.catch(() => EMPTY_CONFIG)` only handles the `fetchApiRoot` rejection. But `handleErrorResponse` inside `fetchApiRoot` calls `notify.error` **and** re-throws a `PGError` — so on a 500 from `/configs` you get a toast, an all-flags-off cache, and that cache is pinned for 15 minutes. Flag flips on the backend won't recover until the TTL expires. Concurrency is actually correct (both loaders await the same in-flight promise; good), but staleness is not.
>
> **Fix:** on error, set `configsLoadedAt = 0` so the next call retries; or shorten the negative-cache TTL to ~30s.

**architecture-strategist (related, P3 — observability gap):**

> A teacher whose `/api/configs` call fails sees the same UI as one whose school has all flags off. No way to distinguish flag-gated hiding from outage. Add a `configs.isFallback` boolean (or `loadedOk: boolean`) so containers can optionally surface "Some features unavailable" once — the fallback itself is correct, the observability is what's missing.

**Location:** `web/api/client.ts:~182-195` (`getConfigs`, `fetchApiRoot`, `EMPTY_CONFIG`)

## Proposed Solutions

### Option A — Invalidate cache on error (recommended)

```ts
export function getConfigs(): Promise<PGApiConfig> {
  const now = Date.now();
  if (configsPromise && now - configsLoadedAt <= CONFIGS_STALE_MS) return configsPromise;

  configsPromise = fetchApiRoot<PGApiConfig>('/configs').catch(() => {
    configsLoadedAt = 0; // allow next call to retry immediately
    return EMPTY_CONFIG;
  });
  configsLoadedAt = now;
  return configsPromise;
}
```

Next call after a failed fetch retries fresh. Still concurrency-safe (both loaders await the in-flight promise).

**Pros:** minimal diff; fixes the stall. **Cons:** a sustained PG outage causes one failed `/configs` fetch per route entry — acceptable since the failure mode is rare. **Effort:** Small. **Risk:** Low.

### Option B — Separate negative TTL

```ts
const CONFIGS_STALE_MS = 15 * 60 * 1000;
const CONFIGS_NEGATIVE_TTL_MS = 30 * 1000; // retry every 30s on error
let lastErrorAt = 0;

export function getConfigs(): Promise<PGApiConfig> {
  const now = Date.now();
  if (
    configsPromise &&
    now - configsLoadedAt <= (lastErrorAt ? CONFIGS_NEGATIVE_TTL_MS : CONFIGS_STALE_MS)
  ) {
    return configsPromise;
  }
  lastErrorAt = 0;
  configsPromise = fetchApiRoot<PGApiConfig>('/configs').catch((err) => {
    lastErrorAt = Date.now();
    return EMPTY_CONFIG;
  });
  configsLoadedAt = now;
  return configsPromise;
}
```

**Pros:** bounds retry rate during sustained outages. **Cons:** more state. **Effort:** Small. **Risk:** Low.

### Option C — Surface `loadedOk` on the config result

Change `PGApiConfig` → `{ ...originalShape, __loadedOk: boolean }` (or wrap in `{ config, loadedOk }`). Containers can optionally show a "Some features unavailable" banner on `!loadedOk`.

**Pros:** addresses the architect's observability gap. **Cons:** API shape change ripples. **Effort:** Medium. **Risk:** Low.

## Recommended Action

<!-- Filled during triage; probably Option A alone or A+C combined -->

## Technical Details

**Affected files:** `web/api/client.ts:~180-200`

## Acceptance Criteria

- [ ] After a failed `/api/configs` fetch, the next call retries fresh
- [ ] Successful fetch still caches for the 15-min TTL
- [ ] No concurrent duplicate fetches when two loaders call `getConfigs()` in parallel
- [ ] Manual smoke: simulate a 500 response (stop the Go server briefly mid-load), observe that subsequent requests retry after recovery

## Work Log

_(add entries as work progresses)_

## Resources

- Review: julik-frontend-races-reviewer, architecture-strategist
- Phase 9 commit: `4aeaddc feat(web): add module-scope getConfigs() with TTL and silent fallback`
