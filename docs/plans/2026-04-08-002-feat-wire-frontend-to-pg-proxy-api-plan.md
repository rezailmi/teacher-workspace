---
title: 'feat: Wire Frontend to PG Proxy API'
type: feat
status: completed
date: 2026-04-08
---

# feat: Wire Frontend to PG Proxy API

## Overview

Replace static mock data imports with live API calls to the Go BFF proxy at `/api/web/2/staff/*`. Use React Router loaders for data fetching. Adapt the frontend UI to work with the fields the API actually provides — no fixture modifications.

## Problem Statement

The frontend imports a hardcoded `mockPGAnnouncements` array from `web/data/mock-pg-announcements.ts`. The Go BFF now serves PG API fixtures at real endpoints. The API response shapes differ significantly from the frontend types (uppercase status, different field names, missing fields). We need a mapper layer and data-fetching infrastructure.

## Key Decisions

1. **Focus on what the API provides** — adapt the UI to API shapes, don't modify Go fixtures
2. **React Router loaders** — use `loader` functions on route definitions for data fetching
3. **Keep FE types** — PGAnnouncement and friends stay as the UI's internal types; a mapper converts API responses

## Proposed Solution

### API → FE Type Mapping

Create an API client layer with typed responses and mapper functions.

**List endpoint** (`GET /api/web/2/staff/announcements`):

| API field                                        | Maps to FE field                         | Conversion                                                     |
| ------------------------------------------------ | ---------------------------------------- | -------------------------------------------------------------- |
| `postId`                                         | `id`                                     | `String(postId)`                                               |
| `title`                                          | `title`                                  | direct                                                         |
| `date`                                           | `postedAt` / `scheduledAt` / `createdAt` | route by `status`                                              |
| `status`                                         | `status`                                 | `.toLowerCase()` → `PGStatus`                                  |
| `toParentsOf`                                    | (none — not used by components)          | drop                                                           |
| `readMetrics.readPerStudent`                     | `stats.readCount`                        | `Math.round(readPerStudent * totalStudents)`                   |
| `readMetrics.totalStudents`                      | `stats.totalCount`                       | direct                                                         |
| `createdByName`                                  | `createdBy`                              | direct                                                         |
| (missing) `description`                          | `description`                            | `""` — not available on list                                   |
| (missing) `responseType`                         | `responseType`                           | `"view-only"` default                                          |
| (missing) `ownership`                            | `ownership`                              | derived: own endpoint → `"mine"`, shared endpoint → `"shared"` |
| (missing) `stats.responseCount/yesCount/noCount` | `stats.*`                                | `0` defaults                                                   |
| (missing) `recipients`                           | `recipients`                             | `[]` — not available on list                                   |

**Detail endpoint** (`GET /api/web/2/staff/announcements/{postId}`):

| API field             | Maps to FE field | Conversion                                          |
| --------------------- | ---------------- | --------------------------------------------------- |
| `announcementId`      | `id`             | `String(announcementId)`                            |
| `title`               | `title`          | direct                                              |
| `richTextContent`     | `description`    | extract text nodes from Tiptap JSON, join with `\n` |
| `status`              | `status`         | `.toLowerCase()`                                    |
| `postedDate`          | `postedAt`       | direct                                              |
| `createdAt`           | `createdAt`      | direct                                              |
| `staffName`           | `createdBy`      | direct                                              |
| `enquiryEmailAddress` | `enquiryEmail`   | direct                                              |
| `staffOwners`         | `staffInCharge`  | first owner name                                    |
| `students[]`          | `recipients[]`   | map `isRead` → `readStatus`                         |

**Read status endpoint** (`GET /api/web/2/staff/announcements/{postId}/readStatus`):

| API field              | Maps to FE field           | Conversion                   |
| ---------------------- | -------------------------- | ---------------------------- |
| `totalRecipients`      | `stats.totalCount`         | direct                       |
| `totalRead`            | `stats.readCount`          | direct                       |
| `students[].isRead`    | `recipients[].readStatus`  | `isRead ? 'read' : 'unread'` |
| `students[].readAt`    | `recipients[].respondedAt` | direct                       |
| `students[].className` | `recipients[].classLabel`  | direct                       |

### UI Adaptations (list page)

Since the list API lacks `responseType`, `description`, and response stats:

1. **Remove tab split** — show all posts in a single list (no "Posts" vs "Posts with responses" tabs)
2. **Remove description subtitle** from table rows — API doesn't provide it
3. **Simplify search** — search by title only (no description search)
4. **Simplify Read/Response column** — show read count from `readMetrics` only (no response/yes/no breakdown on list)
5. **Keep ownership column** — derived from which endpoint returned the post

The detail page gets full data from the detail + readStatus endpoints, so it can remain unchanged.

## Technical Approach

### Architecture

```
Route loader → API client (fetch) → API types → Mapper → FE types → Component
```

### File Structure

```
web/
├── api/
│   ├── client.ts          — fetch wrapper with error handling
│   ├── types.ts           — API response types (what the server returns)
│   └── mappers.ts         — API → FE type conversion functions
├── data/
│   └── mock-pg-announcements.ts  — keep types + helpers, remove mock data array
├── containers/
│   ├── PostsView.tsx      — use loader data, simplified UI
│   ├── PostDetailView.tsx — use loader data
│   └── CreatePostView.tsx — use loader data for edit mode
```

## Implementation Phases

### Phase 1: API Client + Types + Vite Proxy

**Create `web/api/types.ts`** — TypeScript types matching the actual API responses:

```typescript
// List response
interface PGApiAnnouncementList {
  posts: PGApiAnnouncementSummary[];
  total: number;
  page: number;
  pageSize: number;
}

interface PGApiAnnouncementSummary {
  id: string;
  postId: number;
  title: string;
  date: string;
  status: 'POSTED' | 'SCHEDULED' | 'DRAFT';
  toParentsOf: string[];
  readMetrics: { readPerStudent: number; totalStudents: number };
  scheduledSendFailureCode: string | null;
  createdByName: string;
}

// Detail response
interface PGApiAnnouncementDetail {
  announcementId: number;
  title: string;
  content: string | null;
  richTextContent: string;
  staffName: string;
  createdBy: number;
  createdAt: string;
  postedDate: string;
  enquiryEmailAddress: string;
  staffOwners: Array<{ staffID: number; staffName: string }>;
  students: Array<{ studentId: number; studentName: string; className: string; isRead: boolean }>;
  status: string;
  scheduledSendAt: string | null;
  attachments: unknown[];
  images: unknown[];
  shortcutLink: unknown[];
  websiteLinks: unknown[];
}

// Read status response
interface PGApiReadStatus {
  postId: number;
  totalRecipients: number;
  totalRead: number;
  students: Array<{
    studentId: number;
    studentName: string;
    className: string;
    isRead: boolean;
    readAt: string | null;
  }>;
}
```

**Create `web/api/client.ts`** — Fetch wrapper:

```typescript
const API_BASE = '/api/web/2/staff';

async function fetchApi<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchAnnouncements() { ... }
export async function fetchSharedAnnouncements() { ... }
export async function fetchAnnouncementDetail(postId: string) { ... }
export async function fetchAnnouncementReadStatus(postId: string) { ... }

// Composed loaders (called by route loaders, return mapped FE types)
export async function loadPostsList(): Promise<PGAnnouncement[]> {
  const [own, shared] = await Promise.all([fetchAnnouncements(), fetchSharedAnnouncements()]);
  const mappedOwn = own.posts.map(p => mapAnnouncementSummary(p, 'mine'));
  const mappedShared = shared.posts.map(p => mapAnnouncementSummary(p, 'shared'));
  return mergeAndDedup(mappedOwn, mappedShared);
}

export async function loadPostDetail(postId: string): Promise<PGAnnouncement> {
  const [detail, readStatus] = await Promise.all([
    fetchAnnouncementDetail(postId),
    fetchAnnouncementReadStatus(postId),
  ]);
  return mapAnnouncementDetail(detail, readStatus);
}
```

**Create `web/api/mappers.ts`** — API → FE type converters:

```typescript
export function mapAnnouncementSummary(api: PGApiAnnouncementSummary, ownership: PGOwnership): PGAnnouncement { ... }
export function mapAnnouncementDetail(api: PGApiAnnouncementDetail, readStatus: PGApiReadStatus): PGAnnouncement { ... }
export function mergeAndDedup(own: PGAnnouncement[], shared: PGAnnouncement[]): PGAnnouncement[] {
  // Shared posts that also appear in own list: keep the own version (ownership: 'mine')
  const ownIds = new Set(own.map(a => a.id));
  return [...own, ...shared.filter(a => !ownIds.has(a.id))];
}
function extractTextFromTiptap(json: string): string { ... }
```

**Modify `vite.config.ts`** — Add dev proxy:

```typescript
server: {
  proxy: {
    '/api': 'http://localhost:3000',
  },
}
```

### Phase 2: Route Loaders

React Router 7 requires that lazy routes export their loader from the lazy module — you cannot define a static `loader` alongside `lazy()` on the same route. Each view module must export a `loader` function alongside its `Component`.

**Modify `web/containers/PostsView.tsx`** — Add exported loader:

```typescript
import { loadPostsList } from '~/api/client';

export async function loader() {
  return loadPostsList();
}
```

Component uses `useLoaderData<PGAnnouncement[]>()` to access the result.

**Modify `web/containers/PostDetailView.tsx`** — Add exported loader:

```typescript
import { loadPostDetail } from '~/api/client';
import type { LoaderFunctionArgs } from 'react-router';

export async function loader({ params }: LoaderFunctionArgs) {
  const id = params.id;
  if (!id) throw new Response('Not Found', { status: 404 });
  return loadPostDetail(id);
}
```

**Modify `web/containers/CreatePostView.tsx`** — Add exported loader for edit mode only:

```typescript
import { loadPostDetail } from '~/api/client';
import type { LoaderFunctionArgs } from 'react-router';

export async function loader({ params }: LoaderFunctionArgs) {
  // Only fetch when editing (route has :id param)
  if (!params.id) return null;
  return loadPostDetail(params.id);
}
```

In CreatePostView, use `useLoaderData<PGAnnouncement | null>()` — `null` for create mode, data for edit mode.

**`web/App.tsx` stays unchanged** — routes keep using `lazy()` which picks up both `Component` and `loader` from each module.

### Phase 3: Update PostsView

**Modify `web/containers/PostsView.tsx`**:

1. Replace `mockPGAnnouncements` import with `useLoaderData<PGAnnouncement[]>()`
2. Remove tabs (no `responseType` on list endpoint)
3. Remove description subtitle from table rows
4. Simplify search to title-only
5. Simplify Read/Response column to show read count only (from mapped `stats.readCount / stats.totalCount`)
6. Keep: StatusBadge, Owner column, date column, actions dropdown, clickable rows
7. Add loading fallback via route `HydrateFallback` or Suspense

### Phase 4: Update PostDetailView

**Modify `web/containers/PostDetailView.tsx`**:

1. Replace `getPGAnnouncementById` with `useLoaderData<PGAnnouncement>()`
2. Detail endpoint provides full data — description from `richTextContent`, recipients from `students[]` + `readStatus`
3. Remove the `if (!announcement)` redirect — handled by loader throwing 404
4. Rest of the component (ReadTrackingCards, RecipientReadTable) stays the same since it receives mapped FE types

### Phase 5: Update CreatePostView (Edit Mode)

**Modify `web/containers/CreatePostView.tsx`**:

1. For edit mode: use `useLoaderData<PGAnnouncement | null>()` instead of `getPGAnnouncementById`
2. For create mode (no `:id` param): loader returns `null`, component initializes empty form
3. The `announcementToFormState` function stays the same — it already maps PGAnnouncement to form state

### Phase 6: Clean Up mock-pg-announcements.ts

**Modify `web/data/mock-pg-announcements.ts`**:

1. Remove `mockPGAnnouncements` array (no longer imported anywhere)
2. Remove `getPGAnnouncementById` helper (replaced by loaders)
3. Keep all types and `requiresResponse` helper — still used by 8+ components
4. File becomes a pure types module

## Acceptance Criteria

- [ ] Vite proxy forwards `/api/*` to Go server at `localhost:3000`
- [ ] PostsView fetches from `GET /api/web/2/staff/announcements` + `/shared` via route loader
- [ ] PostDetailView fetches from detail + readStatus endpoints via route loader
- [ ] CreatePostView edit mode uses loader data instead of mock lookup
- [ ] API types in `web/api/types.ts` match actual fixture JSON shapes
- [ ] Mapper correctly converts: status case, date routing, readMetrics → stats, students → recipients
- [ ] List page works without tabs (single list view)
- [ ] List page searches by title only
- [ ] Detail page shows description extracted from `richTextContent`
- [ ] `mockPGAnnouncements` array removed; types preserved
- [ ] `npm run build` passes with no TypeScript errors
- [ ] App works when Go server is running (`go run ./server/cmd/tw`)

## Dependencies & Risks

**Dependencies:**

- Go BFF must be running for API calls to work (`go run ./server/cmd/tw`)
- Vite proxy config for dev environment

**Risks:**

- **Go not installed locally** — Vite proxy will fail. Loader errors surface via React Router's error boundary. Add a route-level `ErrorBoundary` export to PostsView/PostDetailView that shows a "Could not load data" message with a retry button.
- **richTextContent parsing** — Tiptap JSON may have edge cases. Start with simple text extraction (concatenate all `text` nodes, join paragraphs with `\n`).
- **List page simplification** — Removing tabs changes the UX. Tabs can be restored when the API provides `responseType`.

## Sources & References

### Internal References

- FE API wiring instructions: _deleted 2026-04-15 — superseded by `web/api/client.ts`, `web/api/mappers.ts`, `web/api/types.ts` and `docs/audits/pg-backend-contract.md`_
- Go fixtures: `server/internal/pg/fixtures/announcements.json` (real API shapes)
- Go mock routes: `server/internal/pg/mock.go`
- Current FE types: `web/data/mock-pg-announcements.ts`
- Current PostsView: `web/containers/PostsView.tsx`
- Current PostDetailView: `web/containers/PostDetailView.tsx`
- Vite config: `vite.config.ts`

### Related PRs

- PR #1: `feat(server): add PG mock proxy` — initial mock proxy
- PR #2: `feat(server): add full PG fixture set in real API shapes` — changed fixtures to real shapes
- PR #3: `feat(server/pg): add real reverse proxy handler` — production proxy
- PR #4: `feat(pg): add all proxy routes and mock fixtures` — full route coverage
