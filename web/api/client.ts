import type {
  AnnouncementId,
  ConsentFormId,
  PGAnnouncementPost,
  PGConsentFormPost,
} from '~/data/mock-pg-announcements';
import { notify } from '~/lib/notify';

import detailFixture from '../../server/internal/pg/fixtures/announcement_detail.json';
import announcementsFixture from '../../server/internal/pg/fixtures/announcements.json';
import sharedFixture from '../../server/internal/pg/fixtures/announcements_shared.json';
import consentFormsFixture from '../../server/internal/pg/fixtures/consent_forms.json';
import { PGError, PGNotFoundError, PGSessionExpiredError, PGValidationError } from './errors';
import {
  mapAnnouncementDetail,
  mapAnnouncementSummary,
  mapConsentFormDetail,
  mapConsentFormSummaryToPost,
  mergeAndDedup,
  toPGConsentFormCreatePayload,
  toPGConsentFormDraftPayload,
  toPGCreatePayload,
} from './mappers';
import type {
  PGApiAnnouncementDetail,
  PGApiAnnouncementList,
  PGApiClassDetail,
  PGApiConfig,
  PGApiConsentFormDetail,
  PGApiConsentFormList,
  PGApiCreateAnnouncementPayload,
  PGApiCreateConsentFormDraftPayload,
  PGApiCreateConsentFormPayload,
  PGApiCreateDraftPayload,
  PGApiCustomGroupsList,
  PGApiDuplicatePayload,
  PGApiGroupsAssigned,
  PGApiScheduleDraftPayload,
  PGApiSchoolClass,
  PGApiSchoolStaffList,
  PGApiSchoolStudent,
  PGApiSession,
  PGApiUserProfile,
} from './types';

const API_BASE = '/api/web/2/staff';

// ─── Fetch helpers ──────────────────────────────────────────────────────────

// Real pgw-web wraps all responses as {body, resultCode, message, metadata};
// mock fixtures are raw. Detect the envelope by requiring both `body` and a
// numeric `resultCode` — no TW inner shape uses resultCode, so false positives
// are effectively impossible.
function unwrapEnvelope<T>(json: unknown): T {
  if (
    json !== null &&
    typeof json === 'object' &&
    'body' in json &&
    'resultCode' in json &&
    typeof (json as { resultCode: unknown }).resultCode === 'number'
  ) {
    return (json as { body: T }).body;
  }
  return json as T;
}

// Translates pgw's error envelope into a typed `PGError` subclass and applies
// side-effects (redirect for session loss, toast for generic failures) before
// rethrowing. Validation errors are thrown silently so containers can render
// them inline rather than as toasts.
async function handleErrorResponse(res: Response): Promise<never> {
  let resultCode: number | undefined;
  let errorReason: string | undefined;
  try {
    const body = (await res.clone().json()) as {
      resultCode?: number;
      message?: string;
      error?: { errorReason?: string };
    };
    resultCode = body.resultCode;
    errorReason = body.error?.errorReason ?? body.message;
  } catch {
    // Non-JSON body (e.g. HTML error page) — fall through with undefined fields.
  }

  const message = errorReason ?? `Request failed (${res.status}).`;
  const code = resultCode ?? res.status;

  switch (resultCode) {
    case -401:
    case -4012:
      if (typeof window !== 'undefined' && window.location.pathname !== '/session-expired') {
        window.location.href = '/session-expired';
      }
      throw new PGSessionExpiredError(message, code, res.status);
    case -404:
      throw new PGNotFoundError(message, code, res.status);
    case -400:
    case -4001:
    case -4003:
    case -4004:
      throw new PGValidationError(message, code, res.status);
    case -429:
      notify.error('Too many requests. Please slow down and try again.');
      throw new PGError(message, code, res.status);
    default:
      notify.error(message);
      throw new PGError(message, code, res.status);
  }
}

async function fetchApi<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) await handleErrorResponse(res);
  return unwrapEnvelope<T>(await res.json());
}

/**
 * Root-level fetch that bypasses the `/api/web/2/staff` base. Used for
 * endpoints PG exposes at `/api/*` (currently just `/api/configs`). Kept
 * separate from `fetchApi` so the prefix remains the single source of truth
 * for the staff-scoped surface.
 */
async function fetchApiRoot<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  if (!res.ok) await handleErrorResponse(res);
  return unwrapEnvelope<T>(await res.json());
}

async function mutateApi<T>(method: 'POST' | 'PUT', path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) await handleErrorResponse(res);
  // Handle empty responses (204 No Content or empty body)
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return unwrapEnvelope<T>(JSON.parse(text));
}

async function deleteApi(path: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, { method: 'DELETE' });
  if (!res.ok) await handleErrorResponse(res);
}

/** Returns fallback on network errors; re-throws HTTP and abort errors. */
async function fetchApiSafe<T>(path: string, fallback: T): Promise<T> {
  try {
    return await fetchApi<T>(path);
  } catch (err) {
    // Re-throw AbortError so React Router's navigation cancellation works
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    // Re-throw HTTP errors so they surface to error boundaries / containers
    if (err instanceof PGError) throw err;
    // Only fall back for network-level failures (server unreachable)
    console.warn(`[PG API] Network error fetching ${path}, using fixture fallback`);
    return fallback;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGS (feature flags)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `/api/configs` is served outside the `/staff` base path (PG exposes it at
 * `/api/configs` root), so we call `fetchApiRoot` rather than `fetchApi`. The
 * response drives feature-flag gates (schedule-send, duplicate, shortcuts);
 * loaders fetch it once per route entry and pass it down via `useLoaderData`.
 *
 * Memoised at module scope so a given session only pays the RTT once. The
 * TTL (`CONFIGS_STALE_MS`) invalidates the cache so long-lived sessions pick
 * up flag flips without a hard refresh. Fetch failures fall back to an
 * all-flags-off shape — no toast, no banner; the gated UI simply hides.
 */
const CONFIGS_STALE_MS = 15 * 60 * 1000;
let configsPromise: Promise<PGApiConfig> | null = null;
let configsLoadedAt = 0;

const EMPTY_CONFIG: PGApiConfig = { flags: {}, configs: {} };

export function getConfigs(): Promise<PGApiConfig> {
  const now = Date.now();
  if (!configsPromise || now - configsLoadedAt > CONFIGS_STALE_MS) {
    configsLoadedAt = now;
    configsPromise = fetchApiRoot<PGApiConfig>('/configs').catch(() => {
      // Drop the negative result out of the cache on the next tick so the
      // following route entry re-fetches instead of waiting out the 15-min
      // TTL. Without this a single transient failure grounded the Schedule
      // and Duplicate UI for the rest of the session.
      configsLoadedAt = 0;
      configsPromise = null;
      return EMPTY_CONFIG;
    });
  }
  return configsPromise;
}

// ═══════════════════════════════════════════════════════════════════════════
// ANNOUNCEMENTS
// ═══════════════════════════════════════════════════════════════════════════

// ─── Read ───────────────────────────────────────────────────────────────────

function fetchAnnouncements() {
  return fetchApiSafe<PGApiAnnouncementList>(
    '/announcements',
    announcementsFixture as unknown as PGApiAnnouncementList,
  );
}

function fetchSharedAnnouncements() {
  return fetchApiSafe<PGApiAnnouncementList>(
    '/announcements/shared',
    sharedFixture as unknown as PGApiAnnouncementList,
  );
}

async function fetchAnnouncementDetail(postId: AnnouncementId): Promise<PGApiAnnouncementDetail> {
  // pgw-web wraps single-detail responses as `body: [<detail>]`; unwrap the array.
  // Fixture mirrors that shape so mock mode stays in lockstep.
  const arr = await fetchApiSafe<PGApiAnnouncementDetail[]>(
    `/announcements/${postId}`,
    detailFixture as unknown as PGApiAnnouncementDetail[],
  );
  return arr[0];
}

// ─── Write ──────────────────────────────────────────────────────────────────

/** Create and immediately send an announcement. */
export function createAnnouncement(payload: PGApiCreateAnnouncementPayload) {
  return mutateApi<{ postId: number }>('POST', '/announcements', toPGCreatePayload(payload));
}

/** Save an announcement as draft. */
export function createDraft(payload: PGApiCreateDraftPayload) {
  const body = { ...toPGCreatePayload(payload), scheduledSendAt: payload.scheduledSendAt };
  return mutateApi<{ announcementDraftId: number }>('POST', '/announcements/drafts', body);
}

/** Schedule a draft for future sending. */
export function scheduleDraft(payload: PGApiScheduleDraftPayload) {
  return mutateApi<void>('POST', '/announcements/drafts/schedule', payload);
}

/** Update an existing draft. */
export function updateDraft(draftId: number, payload: PGApiCreateDraftPayload) {
  const body = { ...toPGCreatePayload(payload), scheduledSendAt: payload.scheduledSendAt };
  return mutateApi<void>('PUT', `/announcements/drafts/${draftId}`, body);
}

/** Duplicate an existing announcement. */
export function duplicateAnnouncement(payload: PGApiDuplicatePayload) {
  return mutateApi<{ postId: number }>('POST', '/announcements/duplicate', payload);
}

/** Delete a posted announcement. */
export function deleteAnnouncement(postId: AnnouncementId) {
  return deleteApi(`/announcements/${postId}`);
}

/** Delete a draft announcement. */
export function deleteDraft(draftId: number) {
  return deleteApi(`/announcements/drafts/${draftId}`);
}

// ─── Composed loaders ───────────────────────────────────────────────────────

export async function loadPostsList(): Promise<PGAnnouncementPost[]> {
  const [own, shared] = await Promise.all([fetchAnnouncements(), fetchSharedAnnouncements()]);
  const mappedOwn = own.map((p) => mapAnnouncementSummary(p, 'mine'));
  const mappedShared = shared.map((p) => mapAnnouncementSummary(p, 'shared'));
  return mergeAndDedup(mappedOwn, mappedShared);
}

export async function loadPostDetail(postId: AnnouncementId): Promise<PGAnnouncementPost> {
  const detail = await fetchAnnouncementDetail(postId);
  return mapAnnouncementDetail(detail);
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSENT FORMS
// ═══════════════════════════════════════════════════════════════════════════

// ─── Read ───────────────────────────────────────────────────────────────────

function fetchConsentForms() {
  return fetchApiSafe<PGApiConsentFormList>(
    '/consentForms',
    consentFormsFixture as unknown as PGApiConsentFormList,
  );
}

function fetchSharedConsentForms() {
  return fetchApiSafe<PGApiConsentFormList>(
    '/consentForms/shared',
    consentFormsFixture as unknown as PGApiConsentFormList,
  );
}

export function fetchConsentFormDetail(formId: ConsentFormId) {
  // pgw strips the `cf_` prefix when addressing the detail endpoint.
  const numericId = formId.slice(3);
  return fetchApi<PGApiConsentFormDetail>(`/consentForms/${numericId}`);
}

// ─── Write ──────────────────────────────────────────────────────────────────

/** Create and immediately send a consent form. */
export function createConsentForm(payload: PGApiCreateConsentFormPayload) {
  return mutateApi<{ consentFormId: number }>(
    'POST',
    '/consentForms',
    toPGConsentFormCreatePayload(payload),
  );
}

/** Save a consent form as draft (optionally with a scheduled send-at). */
export function createConsentFormDraft(payload: PGApiCreateConsentFormDraftPayload) {
  return mutateApi<{ consentFormDraftId: number }>(
    'POST',
    '/consentForms/drafts',
    toPGConsentFormDraftPayload(payload),
  );
}

/** Update an existing consent-form draft. */
export function updateConsentFormDraft(
  draftId: number,
  payload: PGApiCreateConsentFormDraftPayload,
) {
  return mutateApi<void>(
    'PUT',
    `/consentForms/drafts/${draftId}`,
    toPGConsentFormDraftPayload(payload),
  );
}

export function updateConsentFormDueDate(formId: number, payload: { consentByDate: string }) {
  return mutateApi<void>('PUT', `/consentForms/${formId}/updateDueDate`, payload);
}

export function deleteConsentForm(formId: ConsentFormId) {
  const numericId = formId.slice(3);
  return deleteApi(`/consentForms/${numericId}`);
}

export function deleteConsentFormDraft(draftId: number) {
  return deleteApi(`/consentForms/drafts/${draftId}`);
}

// ─── Composed loaders ───────────────────────────────────────────────────────

/** Consent-form list loader that returns the unified `PGConsentFormPost[]` shape. */
export async function loadConsentPostsList(): Promise<PGConsentFormPost[]> {
  const [own, shared] = await Promise.all([fetchConsentForms(), fetchSharedConsentForms()]);
  const mappedOwn = own.posts.map((p) => mapConsentFormSummaryToPost(p, 'mine'));
  const mappedShared = shared.posts.map((p) => mapConsentFormSummaryToPost(p, 'shared'));
  return mergeAndDedup(mappedOwn, mappedShared);
}

/** Consent-form detail loader that returns the unified `PGConsentFormPost` shape. */
export async function loadConsentPostDetail(formId: ConsentFormId): Promise<PGConsentFormPost> {
  const detail = await fetchConsentFormDetail(formId);
  return mapConsentFormDetail(detail);
}

// ═══════════════════════════════════════════════════════════════════════════
// SCHOOL DATA (for selectors and forms)
// ═══════════════════════════════════════════════════════════════════════════

export function fetchSchoolStaff() {
  return fetchApi<PGApiSchoolStaffList>('/school/staff');
}

// Real pgw-web returns `body.class` (singular) as an array of PGApiSchoolClass.
// Use this helper when a UI needs just the classes for a selector.
export async function fetchSchoolClasses() {
  const data = await fetchApi<{ class: PGApiSchoolClass[] }>('/school/groups');
  return data.class ?? [];
}

export function fetchSchoolStudents() {
  return fetchApi<PGApiSchoolStudent[]>('/school/students');
}

export function fetchGroupsAssigned() {
  return fetchApi<PGApiGroupsAssigned>('/groups/assigned');
}

export function fetchCustomGroups() {
  return fetchApi<PGApiCustomGroupsList>('/groups/custom');
}

export function fetchClassDetail(classId: number) {
  return fetchApi<PGApiClassDetail>(`/groups/classes/${classId}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION & ACCOUNT
// ═══════════════════════════════════════════════════════════════════════════

export function fetchSession() {
  return fetchApi<PGApiSession>('/session/current');
}

export function fetchUserProfile() {
  return fetchApi<PGApiUserProfile>('/users/me');
}

export function updateDisplayName(staffId: number, displayName: string) {
  return mutateApi<void>('PUT', `/${staffId}/updateDisplayName`, { displayName });
}

export function updateDisplayEmail(staffId: number, displayEmail: string) {
  return mutateApi<void>('PUT', `/${staffId}/updateDisplayEmail`, { displayEmail });
}
