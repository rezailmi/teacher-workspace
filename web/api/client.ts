import type {
  AnnouncementDraftId,
  AnnouncementId,
  ConsentFormDraftId,
  ConsentFormId,
  PGAnnouncementPost,
  PGConsentFormPost,
} from '~/data/mock-pg-announcements';
import { notify } from '~/lib/notify';

import { PGError, PGNotFoundError, PGSessionExpiredError, PGValidationError } from './errors';
import {
  mapAnnouncementDetail,
  mapAnnouncementDraftDetail,
  mapAnnouncementSummary,
  mapConsentFormDetail,
  mapConsentFormDraftDetail,
  mapConsentFormSummaryToPost,
  mergeAndDedup,
  toPGConsentFormCreatePayload,
  toPGConsentFormDraftPayload,
  toPGCreatePayload,
} from './mappers';
import type {
  PGApiAnnouncementDetail,
  PGApiAnnouncementDraft,
  PGApiAnnouncementList,
  PGApiClassDetail,
  PGApiConfig,
  PGApiConsentFormDetail,
  PGApiConsentFormDraft,
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
      // Bare HTTP 404s (no pgw envelope) come from the mock's `http.NotFound`
      // or any upstream that returns 404 without a `resultCode`. Normalise to
      // `PGNotFoundError` so detail-route boundaries can render a 'Post not
      // found' page instead of a generic toast.
      if (res.status === 404) {
        throw new PGNotFoundError(message, code, res.status);
      }
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

async function mutateApi<T>(
  method: 'POST' | 'PUT',
  path: string,
  body: unknown,
  options: { signal?: AbortSignal } = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options.signal,
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
  return fetchApi<PGApiAnnouncementList>('/announcements');
}

function fetchSharedAnnouncements() {
  return fetchApi<PGApiAnnouncementList>('/announcements/shared');
}

async function fetchAnnouncementDetail(postId: AnnouncementId): Promise<PGApiAnnouncementDetail> {
  // pgw-web wraps single-detail responses as `body: [<detail>]`; unwrap the array.
  const arr = await fetchApi<PGApiAnnouncementDetail[]>(`/announcements/${postId}`);
  return arr[0];
}

async function fetchAnnouncementDraftDetail(
  draftId: AnnouncementDraftId,
): Promise<PGApiAnnouncementDraft> {
  // pgw-web wraps single-detail responses as `body: [<detail>]`; unwrap.
  const bareId = draftId.replace(/^annDraft_/, '');
  const arr = await fetchApi<PGApiAnnouncementDraft[]>(`/announcements/drafts/${bareId}`);
  return arr[0];
}

// ─── Write ──────────────────────────────────────────────────────────────────

/** Create and immediately send an announcement. */
export function createAnnouncement(payload: PGApiCreateAnnouncementPayload) {
  return mutateApi<{ postId: number }>('POST', '/announcements', toPGCreatePayload(payload));
}

/** Save an announcement as draft. PGW allows partial data on drafts. */
export function createDraft(
  payload: PGApiCreateDraftPayload,
  options: { signal?: AbortSignal } = {},
): Promise<{ announcementDraftId: number }> {
  const body = {
    ...toPGCreatePayload(payload, { allowPartial: true }),
    scheduledSendAt: payload.scheduledSendAt,
  };
  return mutateApi('POST', '/announcements/drafts', body, options);
}

/** Schedule a draft for future sending. */
export function scheduleDraft(payload: PGApiScheduleDraftPayload) {
  return mutateApi<void>('POST', '/announcements/drafts/schedule', payload);
}

/** Update an existing draft. PGW allows partial data on drafts. */
export function updateDraft(
  draftId: number,
  payload: PGApiCreateDraftPayload,
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  const body = {
    ...toPGCreatePayload(payload, { allowPartial: true }),
    scheduledSendAt: payload.scheduledSendAt,
  };
  return mutateApi('PUT', `/announcements/drafts/${draftId}`, body, options);
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

export async function loadAnnouncementDraftDetail(
  draftId: AnnouncementDraftId,
): Promise<PGAnnouncementPost> {
  const detail = await fetchAnnouncementDraftDetail(draftId);
  return mapAnnouncementDraftDetail(detail);
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSENT FORMS
// ═══════════════════════════════════════════════════════════════════════════

// ─── Read ───────────────────────────────────────────────────────────────────

function fetchConsentForms() {
  return fetchApi<PGApiConsentFormList>('/consentForms');
}

function fetchSharedConsentForms() {
  return fetchApi<PGApiConsentFormList>('/consentForms/shared');
}

export async function fetchConsentFormDetail(
  formId: ConsentFormId,
): Promise<PGApiConsentFormDetail> {
  // pgw strips the `cf_` prefix when addressing the detail endpoint. The
  // response shape is `body: [<detail>]` (single-element array) — unwrap.
  const numericId = formId.slice(3);
  const arr = await fetchApi<PGApiConsentFormDetail[]>(`/consentForms/${numericId}`);
  return arr[0];
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
export function createConsentFormDraft(
  payload: PGApiCreateConsentFormDraftPayload,
  options: { signal?: AbortSignal } = {},
) {
  return mutateApi<{ consentFormDraftId: number }>(
    'POST',
    '/consentForms/drafts',
    toPGConsentFormDraftPayload(payload),
    options,
  );
}

/** Update an existing consent-form draft. */
export function updateConsentFormDraft(
  draftId: number,
  payload: PGApiCreateConsentFormDraftPayload,
  options: { signal?: AbortSignal } = {},
) {
  return mutateApi<void>(
    'PUT',
    `/consentForms/drafts/${draftId}`,
    toPGConsentFormDraftPayload(payload),
    options,
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
  const mappedOwn = own.map((p) => mapConsentFormSummaryToPost(p, 'mine'));
  const mappedShared = shared.map((p) => mapConsentFormSummaryToPost(p, 'shared'));
  return mergeAndDedup(mappedOwn, mappedShared);
}

/** Consent-form detail loader that returns the unified `PGConsentFormPost` shape. */
export async function loadConsentPostDetail(formId: ConsentFormId): Promise<PGConsentFormPost> {
  const detail = await fetchConsentFormDetail(formId);
  return mapConsentFormDetail(detail);
}

async function fetchConsentFormDraftDetail(
  draftId: ConsentFormDraftId,
): Promise<PGApiConsentFormDraft> {
  // Strip the `cfDraft_` prefix to get the bare numeric ID.
  const bareId = draftId.replace(/^cfDraft_/, '');
  // pgw-web wraps single-detail responses as `body: [<detail>]`; unwrap.
  const arr = await fetchApi<PGApiConsentFormDraft[]>(`/consentForms/drafts/${bareId}`);
  return arr[0];
}

export async function loadConsentFormDraftDetail(
  draftId: ConsentFormDraftId,
): Promise<PGConsentFormPost> {
  const draft = await fetchConsentFormDraftDetail(draftId);
  return mapConsentFormDraftDetail(draft);
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
