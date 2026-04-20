---
title: 'feat: Posts End-to-End Frontend (Create, Detail, Edit)'
type: feat
status: completed
date: 2026-04-08
---

# feat: Posts End-to-End Frontend (Create, Detail, Edit)

## Enhancement Summary

**Deepened on:** 2026-04-08
**Agents used:** TypeScript reviewer, Pattern recognition, Performance oracle, Code simplicity, Frontend races, Architecture strategist, Best practices researcher, Frontend design

### Key Improvements from Deepening

1. **Consolidated form state** — `useReducer` with typed action union replaces 10 `useState` hooks
2. **Route remount safety** — `key={id ?? 'new'}` pattern prevents stale state when navigating between create/edit
3. **Performance** — `useDeferredValue` + `React.memo` for preview panel, prevents re-render cascades
4. **Type safety** — Discriminated unions for response-type-dependent fields instead of optional fields
5. **Simplified components** — Inline small selectors, use checkbox list for recipients, simplified preview card
6. **Clickable table rows** — CSS overlay anchor pattern for accessibility and native link behavior
7. **Error handling** — Suspense boundary around Outlet, 404 handling for invalid post IDs

### New Considerations Discovered

- CreatePostView must use `key` prop to force remount when switching between create and edit modes
- Missing root Suspense boundary in RootLayout will cause blank flashes during lazy route loads
- Dialog close animation races with navigate — must sequence close → animate → navigate
- `useBlocker` available for unsaved-changes guard (future enhancement)

---

## Overview

Complete the Posts feature end-to-end with Create Post, Post Detail, and Edit Post pages. The list page at `/posts` is already implemented. This plan adds three new routes and ~10 new components to match the design reference repo (`String-sg/design-teacher-workspace`).

All data is static mock — no mutation across routes. Create/edit pages are form UI only.

## Problem Statement / Motivation

The Posts list page is functional but teachers cannot create, view details, or edit posts. The "Create" button is disabled, table rows are not clickable, and there are no sub-routes. This makes the Posts feature incomplete for frontend demonstration purposes.

## Proposed Solution

Add three routes under `/posts`:

| Route             | Page                       | Purpose                                            |
| ----------------- | -------------------------- | -------------------------------------------------- |
| `/posts/new`      | CreatePostView             | Compose new post with form + live preview          |
| `/posts/:id`      | PostDetailView             | View post details, read tracking, recipient table  |
| `/posts/:id/edit` | CreatePostView (edit mode) | Edit existing post (same component, pre-populated) |

### Architecture Decisions

1. **No shared state / no mutation**: Static mock data. Create/edit pages render forms but don't persist. List always shows the same 3 mock entries.
2. **Edit URL**: `/posts/:id/edit`. Cleaner URLs, better browser history. Same component (`CreatePostView`) with `useParams` to detect edit mode.
3. **Route remount via key**: CreatePostView uses `key={id ?? 'new'}` to force React to destroy and recreate the subtree when switching between create and edit modes. This prevents stale form state.
4. **Preview panel**: Side-by-side on `lg+` breakpoint, hidden on mobile with "Preview" toggle button. Uses simple styled Card (not phone-frame mockup) for maintainability.
5. **Rich text**: Use `Textarea` from `@flow/core` (not Tiptap). No external dependency.
6. **Route structure**: Flat sibling routes under the existing root. React Router 7 resolves static segments (`posts/new`) before dynamic segments (`posts/:id`), so no conflicts.
7. **Form state**: Single `useReducer` with typed action union (not 10 individual `useState` hooks). Enables clean reset, single dispatch reference for memoized children.
8. **Type strategy**: Discriminated unions for response-type-dependent fields. `FormQuestion` uses discriminated union for free-text vs MCQ.

## Technical Considerations

### New UI Wrappers Needed (`~/components/ui/`)

| Component                                                      | Wrapper Override           | File              |
| -------------------------------------------------------------- | -------------------------- | ----------------- |
| Textarea                                                       | `rounded-xl` (match Input) | `textarea.tsx`    |
| Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter | Pure re-export             | `dialog.tsx`      |
| Select, SelectTrigger, SelectContent, SelectItem, SelectValue  | Pure re-export             | `select.tsx`      |
| Separator                                                      | Pure re-export             | `separator.tsx`   |
| RadioGroup, RadioGroupItem                                     | Pure re-export             | `radio-group.tsx` |
| Progress                                                       | Pure re-export             | `progress.tsx`    |

### Data Model Extensions

Extend `PGAnnouncement` in `web/data/mock-pg-announcements.ts`:

```typescript
// Use discriminated union for response-type-dependent data
type PGResponseData =
  | { responseType: 'view-only' }
  | { responseType: 'acknowledge'; dueDate?: string }
  | { responseType: 'yes-no'; dueDate?: string; questions?: FormQuestion[] };

// FormQuestion with discriminated union
type FormQuestion =
  | { id: string; text: string; type: 'free-text' }
  | { id: string; text: string; type: 'mcq'; options: [string, ...string[]] };

// Add to PGAnnouncement (all optional, backward-compatible)
staffInCharge?: string;
enquiryEmail?: string;
shortcuts?: PGShortcut[];

// PGShortcut (renamed from Shortcut for PG prefix consistency)
interface PGShortcut { id: string; label: string; url: string; }

// Extend PGRecipient with fields needed by detail page
classLabel: string;
indexNo: string;
parentRelationship: string;
pgStatus: 'onboarded' | 'not_onboarded';
acknowledgedAt?: string;
questionAnswers?: Record<string, string>;
```

### Form State Type

Define separately from `PGAnnouncement` — this is a view-model, not a data model:

```typescript
interface PostFormState {
  title: string;
  description: string;
  selectedRecipients: SelectedRecipient[];
  responseType: ResponseType;
  questions: FormQuestion[];
  shortcuts: PGShortcut[];
  staffInCharge: string;
  enquiryEmail: string;
  dueDate: string;
}

type PostFormAction =
  | { type: 'SET_FIELD'; field: keyof PostFormState; value: unknown }
  | { type: 'ADD_QUESTION'; payload: FormQuestion }
  | { type: 'REMOVE_QUESTION'; id: string }
  | { type: 'REORDER_QUESTIONS'; payload: FormQuestion[] }
  | { type: 'TOGGLE_SHORTCUT'; id: string }
  | { type: 'SET_RECIPIENTS'; payload: SelectedRecipient[] }
  | { type: 'RESET'; payload?: PostFormState };
```

### Mock Data

Keep mock data co-located in `web/data/mock-pg-announcements.ts` (extend existing file) and small inline constants where used once:

- Staff list (5-8 entries): inline `const MOCK_STAFF` in CreatePostView
- PG shortcuts (2 presets): inline `const PG_SHORTCUTS` in CreatePostView
- Class rosters (3A, 3B, 3C): inline `const MOCK_CLASSES` in CreatePostView

These are tiny mock constants that will be replaced by API calls. No separate files needed.

### Shared Helper Extraction (prerequisite refactor)

Move from `PostsView.tsx` to `web/helpers/dateTime.ts`:

- `DATE_FORMATTER` — reused in PostDetailView
- `formatDate(iso)` — reused in PostDetailView
- `isLowReadRate(postedAt, readCount, total)` — reused in PostDetailView

### Icons Needed (all verified in `@flow/icons`)

ArrowLeft, Calendar, ChevronDown, ChevronUp, Eye, EyeOff, Plus, Search, Send, Trash2, X, Check, GripVertical, MoreHorizontal, Copy, Filter

## Implementation Phases

### Phase 1: Foundation (Routing + UI Wrappers + Data Model + Helpers)

**Files to modify:**

- **`web/App.tsx`** — Add 3 new routes as children alongside existing routes:

  ```typescript
  { path: 'posts/new', lazy: () => import('./containers/CreatePostView') }
  { path: 'posts/:id', lazy: () => import('./containers/PostDetailView') }
  { path: 'posts/:id/edit', lazy: () => import('./containers/CreatePostView') }
  ```

- **`web/containers/RootLayout.tsx`** — Add Suspense boundary around `<Outlet />`:

  ```tsx
  <React.Suspense fallback={null}>
    <Outlet />
  </React.Suspense>
  ```

- **`web/data/mock-pg-announcements.ts`** — Extend types with discriminated unions. Add `staffInCharge`, `enquiryEmail`, `shortcuts` fields to existing entries. Extend `PGRecipient` with `classLabel`, `indexNo`, `parentRelationship`, `pgStatus`. Add `getPGAnnouncementById(id)` helper.

- **`web/helpers/dateTime.ts`** — Move `DATE_FORMATTER`, `formatDate`, `isLowReadRate` from PostsView.tsx.

- **`web/containers/PostsView.tsx`** — Import date helpers from `~/helpers/dateTime`. Remove inline definitions.

- **`web/components/ui/index.ts`** — Add new exports.

**Files to create:**

- `web/components/ui/dialog.tsx` — Pure re-export from `@flow/core`
- `web/components/ui/textarea.tsx` — Wrap with `rounded-xl` (match Input)
- `web/components/ui/select.tsx` — Pure re-export from `@flow/core`
- `web/components/ui/separator.tsx` — Pure re-export
- `web/components/ui/radio-group.tsx` — Pure re-export
- `web/components/ui/progress.tsx` — Pure re-export
- `web/containers/CreatePostView.tsx` — Stub
- `web/containers/PostDetailView.tsx` — Stub

### Phase 2: Create Post Page

Two-column layout: form on left (`flex-1 max-w-[640px]`), preview on right (`w-[320px] sticky top-[72px]`).

**File: `web/containers/CreatePostView.tsx`**

#### Layout

```
┌─────────────────────────────────────────────────────┐
│ ← Back to Posts                    [Save Draft] [Send]│
├──────────────────────┬──────────────────────────────┤
│                      │                              │
│  FORM (max-w-640)    │  PREVIEW (w-320, sticky)     │
│                      │                              │
│  Title               │  ┌──────────────────────┐   │
│  Description         │  │ Parents Gateway       │   │
│  ────────────────    │  │ Post Title            │   │
│  Recipients          │  │ Post Description...   │   │
│  ────────────────    │  │                       │   │
│  Response Type       │  │ [Response buttons]    │   │
│  (if acknowledge/    │  └──────────────────────┘   │
│   yes-no: due date   │                              │
│   + questions)       │                              │
│  ────────────────    │                              │
│  Shortcuts ☐☐        │                              │
│  Staff selector      │                              │
│  Enquiry email       │                              │
│                      │                              │
└──────────────────────┴──────────────────────────────┘
```

Below `lg` (1024px): single column, preview hidden. "Preview" toggle button in header.

#### Component Architecture

**Route component (thin wrapper with key):**

```tsx
function CreatePostView() {
  const { id } = useParams();
  return <CreatePostViewInner key={id ?? 'new'} editId={id} />;
}
export { CreatePostView as Component };
```

**Inner component uses `useReducer`:**

```tsx
function CreatePostViewInner({ editId }: { editId?: string }) {
  const navigate = useNavigate();
  const editData = editId ? getPGAnnouncementById(editId) : undefined;

  if (editId && !editData) {
    return <Navigate to="/posts" replace />;
  }

  const [state, dispatch] = useReducer(postFormReducer, editData, initFormState);
  const deferredState = useDeferredValue(state);
  // ...
}
```

#### Form Sections (top to bottom, separated by `space-y-8`)

1. **Title** — `Input` from `~/components/ui`, required
2. **Description** — `Textarea` from `~/components/ui` (new wrapper, `rounded-xl`)
3. **Recipients** — `RecipientSelector` component (see below)
4. **Response Type** — `ResponseTypeSelector` component (see below)
5. **Questions** (conditional, animate in) — `QuestionBuilder` component (see below)
6. **Shortcuts** — Inline checkbox list (2 items: Travel, Contact Details). Not a separate component — too small.
7. **Staff in charge** — Inline `Select` dropdown from `@flow/core`. 5-8 mock options. Not a separate component.
8. **Enquiry email** — Inline `Select` dropdown. Not a separate component.

#### Components (extracted, in `web/components/comms/`)

| Component                | File                         | Description                                                                                                                                                 |
| ------------------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RecipientSelector`      | `RecipientSelector.tsx`      | Checkbox list grouped by class (3A, 3B, 3C) with "Select all" per class. Shows selected count as Badge. Uses Checkbox + Label from `~/components/ui`.       |
| `ResponseTypeSelector`   | `ResponseTypeSelector.tsx`   | RadioGroup with 3 options. When acknowledge/yes-no: reveals due date input + question builder section with `animate-in fade-in` transition.                 |
| `QuestionBuilder`        | `QuestionBuilder.tsx`        | Add/edit/reorder up to 5 questions. Each question: text Input + type selector (free-text/MCQ). MCQ: 2-6 options. Reorder via ChevronUp/ChevronDown buttons. |
| `PostPreview`            | `PostPreview.tsx`            | Styled Card preview of parent-facing view. Shows title, description, response buttons. Receives `deferredState` as props. Wrapped in `React.memo`.          |
| `SendConfirmationDialog` | `SendConfirmationDialog.tsx` | Dialog showing title + recipient count. Cancel / Confirm & Send buttons. On confirm: close dialog → wait for animation → toast → navigate.                  |

**RecipientSelector implementation:**

- Simple inline checkbox groups (not Popover + Command — overkill for 3 mock classes)
- Each class group: "Select all 3A" checkbox + individual student checkboxes
- Selected count displayed as Badge pill
- Wrapped in a bordered container with `rounded-xl`

**PostPreview implementation:**

- Styled `Card` with rounded corners (`rounded-2xl`)
- Header bar: "Parents Gateway" in `bg-blue-9 text-white rounded-t-2xl`
- Content area: post title (`font-medium`), description text, response buttons
- Empty state: "Your post will appear here" in `text-muted-foreground italic`
- `React.memo` wrapped — receives `deferredState` from `useDeferredValue`

**SendConfirmationDialog implementation:**

- `Dialog` from `~/components/ui`
- Summary: post title, recipient count, response type
- Sequenced close: `setOpen(false)` → `onOpenChange` fires after animation → `toast.success()` → `navigate('/posts')`

#### Performance Strategy

1. `useReducer` for form state → single stable `dispatch` reference
2. `useDeferredValue(state)` passed to `PostPreview` → React prioritizes input responsiveness
3. `React.memo` on `PostPreview`, `RecipientSelector`, `QuestionBuilder` → skip re-renders when their specific props haven't changed
4. Below `lg`: conditional render `{showPreview && <PostPreview />}` to avoid phantom re-renders on mobile

### Phase 3: Post Detail Page

**File: `web/containers/PostDetailView.tsx`**

Reads announcement data from `getPGAnnouncementById(id)` using `useParams`.

```
┌─────────────────────────────────────────────────────┐
│ ← Back to Posts                          [Edit]     │
├─────────────────────────────────────────────────────┤
│                                                     │
│ [StatusBadge]  Post Title                           │
│ Posted on: 15 Mar 2026                              │
│                                                     │
│ Description text...                                 │
│                                                     │
├─────────────────────────────────────────────────────┤
│ READ TRACKING          (grid-cols-2 lg:grid-cols-4) │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐             │
│ │ Read     │ │ Response │ │ Yes / No │             │
│ │ 3 / 4   │ │ 2 / 4   │ │ 1Y / 1N  │             │
│ │ ████░░  │ │ ████░░  │ │          │             │
│ └──────────┘ └──────────┘ └──────────┘             │
│                                                     │
├─────────────────────────────────────────────────────┤
│ RECIPIENTS                                          │
│ ┌───────────────────────────────────────────────┐   │
│ │ Student  │ Class │ Read │ Read At │ Parent    │   │
│ │ Chen JK  │ 3A    │ ✓    │ 15 Mar  │ Mrs Chen  │   │
│ │ Koh XY   │ 3A    │ ✗    │ —       │ Mr Koh    │   │
│ └───────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**404 handling:**

```tsx
const { id } = useParams();
const announcement = id ? getPGAnnouncementById(id) : undefined;
if (!announcement) return <Navigate to="/posts" replace />;
```

**Components (in `web/components/comms/`):**

| Component            | File                     | Description                                                                                                                                                  |
| -------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ReadTrackingCards`  | `ReadTrackingCards.tsx`  | 2-3 metric cards with Progress bars. Uses Card from `~/components/ui`, Progress from `@flow/core`.                                                           |
| `RecipientReadTable` | `RecipientReadTable.tsx` | Simple table showing per-student status. Columns vary by response type (conditional ternary, not dynamic config). No search/filter for mock data (3-5 rows). |

**ReadTrackingCards:**

- Cards: `Card size="sm"` from `~/components/ui`
- Progress: `Progress` from `@flow/core`
- Always show "Read" card (readCount / totalCount)
- If acknowledge: add "Acknowledged" card
- If yes-no: add "Responded" card + "Yes/No" breakdown text
- Card value uses `Typography variant="title-md"` for prominence

**RecipientReadTable:**

- Base columns: Student, Class, Read Status (check/x icon), Read At
- If acknowledge: add Acknowledged column
- If yes-no: add Response (Yes/No Badge), Responded At
- Columns added via simple ternary — no column config abstraction
- Sort mock data array at definition time (unread first) — no runtime sort logic

### Phase 4: List Page Updates + Polish

**File: `web/containers/PostsView.tsx`** — Modifications:

1. **Enable "Create" button** → Wrap with `<Link to="/posts/new">` (use `asChild` prop)
2. **Make table rows clickable** → CSS overlay anchor pattern:
   - Add `<Link>` in the title cell, absolutely positioned to cover the row
   - Add `cursor-pointer` and hover styling to `<TableRow>`
   - Action dropdown button gets `z-10 relative` to stay above the overlay
3. **Enable "Duplicate" action** → Navigate to `/posts/new` with toast
4. **Import date helpers** from `~/helpers/dateTime`

**Add barrel export** for comms: `web/components/comms/index.ts`

## Acceptance Criteria

### Functional Requirements

- [ ] "Create" button on list page navigates to `/posts/new`
- [ ] Create page renders form with sections: title, description, recipients, response type, questions (conditional), shortcuts, staff, email
- [ ] Response type toggle shows/hides question builder and due date with animation
- [ ] Preview card shows live post content (deferred updates, `lg+` only)
- [ ] Send confirmation dialog opens on "Send" click, sequences close/navigate
- [ ] Clicking a table row on list page navigates to `/posts/:id` (CSS overlay anchor)
- [ ] Detail page shows post content, status badge, read tracking with Progress bars
- [ ] Recipient table shows per-student read/response status with conditional columns
- [ ] Edit button on detail page navigates to `/posts/:id/edit`
- [ ] Edit page pre-populates form with existing post data (via `key` remount)
- [ ] Navigating to invalid post ID (`/posts/999`) redirects to `/posts`
- [ ] Back navigation from create/detail pages returns to list
- [ ] All pages use Flow DS components via `~/components/ui` wrappers
- [ ] All pages follow token-first styling from DESIGN.md

### Non-Functional Requirements

- [ ] No TypeScript errors (`npm run build` passes)
- [ ] Responsive layout: form single-column below `lg`, preview toggleable
- [ ] No new dependencies (uses existing @flow/core, @flow/icons, react-router)
- [ ] Suspense boundary around Outlet prevents blank flashes during lazy loads

## File Manifest (Creation/Modification Order)

### Phase 1 — Foundation

| Action | File                                                                                        |
| ------ | ------------------------------------------------------------------------------------------- |
| Create | `web/components/ui/dialog.tsx`                                                              |
| Create | `web/components/ui/textarea.tsx`                                                            |
| Create | `web/components/ui/select.tsx`                                                              |
| Create | `web/components/ui/separator.tsx`                                                           |
| Create | `web/components/ui/radio-group.tsx`                                                         |
| Create | `web/components/ui/progress.tsx`                                                            |
| Modify | `web/components/ui/index.ts` — add 6 new exports                                            |
| Modify | `web/data/mock-pg-announcements.ts` — extend types, add fields, add `getPGAnnouncementById` |
| Modify | `web/helpers/dateTime.ts` — add `DATE_FORMATTER`, `formatDate`, `isLowReadRate`             |
| Modify | `web/containers/PostsView.tsx` — import from `~/helpers/dateTime`, remove inline defs       |
| Modify | `web/containers/RootLayout.tsx` — add Suspense boundary                                     |
| Modify | `web/App.tsx` — add 3 new routes                                                            |
| Create | `web/containers/CreatePostView.tsx` — stub                                                  |
| Create | `web/containers/PostDetailView.tsx` — stub                                                  |

### Phase 2 — Create Post Page

| Action  | File                                                      |
| ------- | --------------------------------------------------------- |
| Create  | `web/components/comms/RecipientSelector.tsx`              |
| Create  | `web/components/comms/ResponseTypeSelector.tsx`           |
| Create  | `web/components/comms/QuestionBuilder.tsx`                |
| Create  | `web/components/comms/PostPreview.tsx`                    |
| Create  | `web/components/comms/SendConfirmationDialog.tsx`         |
| Replace | `web/containers/CreatePostView.tsx` — full implementation |

### Phase 3 — Post Detail Page

| Action  | File                                                      |
| ------- | --------------------------------------------------------- |
| Create  | `web/components/comms/ReadTrackingCards.tsx`              |
| Create  | `web/components/comms/RecipientReadTable.tsx`             |
| Replace | `web/containers/PostDetailView.tsx` — full implementation |

### Phase 4 — List Updates + Polish

| Action | File                                                                      |
| ------ | ------------------------------------------------------------------------- |
| Modify | `web/containers/PostsView.tsx` — enable Create, clickable rows, duplicate |
| Create | `web/components/comms/index.ts` — barrel export                           |

## Dependencies & Risks

**Dependencies:**

- `@flow/core`: Dialog, Select, Textarea, RadioGroup, Progress, Separator — all verified available
- `@flow/icons`: ArrowLeft, Send, Eye, GripVertical, etc. — all verified
- React Router 7: `useParams`, `useNavigate`, `Link` — standard API

**Risks:**

- **Flow DS Dialog/Select styling**: Token overrides (shadows: none) apply globally. Verify visual appearance.
- **Create page size**: Target ~500 lines by extracting 5 form section components. If larger, split further.
- **Route param validation**: Handled by redirecting to `/posts` for invalid IDs.

**Future enhancements (not in scope):**

- `useBlocker` for unsaved-changes guard
- Root error boundary for chunk load failures
- Virtualized recipient list for real data (200+ students)
- Filter/search in RecipientReadTable (when row count justifies it)

## Sources & References

### Internal References

- Posts list page: `web/containers/PostsView.tsx`
- Status badge pattern: `web/components/comms/StatusBadge.tsx`
- Read rate component: `web/components/comms/ReadRate.tsx`
- Mock data pattern: `web/data/mock-pg-announcements.ts`
- UI wrapper pattern: `web/components/ui/button.tsx`
- Design system rules: `DESIGN.md`
- Token overrides: `web/flow-teacher-ds.css`
- Date helper: `web/helpers/dateTime.ts`

### External References

- Design reference repo: `String-sg/design-teacher-workspace`
  - Create page: `src/routes/announcements.new.tsx` (1637 lines)
  - Detail page: `src/routes/announcements.$id.tsx` (795 lines)
  - Components: `src/components/comms/` (12+ files)
- React Router 7 Error Boundaries: https://reactrouter.com/how-to/error-boundary
- React Router Navigation Blocking: https://reactrouter.com/how-to/navigation-blocking
- React useDeferredValue: https://react.dev/reference/react/useDeferredValue
- Accessible clickable table rows: https://robertcooper.me/post/table-row-links
