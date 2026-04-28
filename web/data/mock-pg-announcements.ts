import type { PGApiConsentFormHistoryEntry } from '~/api/types';
import type { BadgeVariant } from '~/components/ui/badge';

export type PGStatus = 'posted' | 'scheduled' | 'draft' | 'posting';
export type ResponseType = 'view-only' | 'acknowledge' | 'yes-no';

// Presentation mapping for status badges. Living here (alongside the PGStatus
// type) keeps the status set and its label/variant in sync.
export const PG_STATUS_BADGE: Record<
  PGStatus,
  { label: string; variant: 'success' | 'info' | 'secondary' }
> = {
  posted: { label: 'Posted', variant: 'success' },
  scheduled: { label: 'Scheduled', variant: 'info' },
  posting: { label: 'Posting', variant: 'info' },
  draft: { label: 'Draft', variant: 'secondary' },
};

export const RESPONSE_TYPE_META: Record<ResponseType, { label: string; description: string }> = {
  'view-only': { label: 'View Only', description: 'Parents can read but not respond' },
  acknowledge: { label: 'Acknowledge', description: 'Parents must acknowledge receipt' },
  'yes-no': { label: 'Yes / No', description: 'Parents respond with Yes or No' },
};

export type ResponseTypeWithResponse = 'acknowledge' | 'yes-no';

export function requiresResponse(rt: ResponseType): rt is ResponseTypeWithResponse {
  return rt === 'acknowledge' || rt === 'yes-no';
}
export type PGOwnership = 'mine' | 'shared';

export interface PGShortcut {
  id: string;
  label: string;
  url: string;
}

/**
 * Website link that PG surfaces beneath the description on the Parents
 * Gateway app. Mirrors the PG API `PGApiWebsiteLink` shape — same field names
 * — so hydration can pass the list through without further renaming.
 */
export interface PGWebsiteLink {
  url: string;
  title: string;
}

export type FormQuestionType = 'free-text' | 'mcq';

export type FormQuestion =
  | { id: string; text: string; type: 'free-text' }
  | { id: string; text: string; type: 'mcq'; options: [string, ...string[]] };

export interface PGRecipient {
  studentId: string;
  studentName: string;
  classLabel: string;
  readStatus: 'read' | 'unread';
  respondedAt?: string;
  /**
   * Per-student yes/no answer on a Consent-Form-kind post. Populated by
   * `mapAnnouncementDetail` only when the post's `kind === 'form'`; left
   * undefined for announcement recipients.
   */
  formResponse?: 'yes' | 'no';
  acknowledgedAt?: string;
  questionAnswers?: Record<string, string>;
}

export type PGTargetType = 'class' | 'group' | 'cca' | 'level';

export interface PGAnnouncementTarget {
  type: PGTargetType;
  id: number;
  label: string;
}

export interface PGAnnouncementStats {
  totalCount: number;
  readCount: number;
  responseCount: number;
  yesCount: number;
  noCount: number;
}

/**
 * Read-side shape for a single uploaded attachment or photo carried through
 * `PGAnnouncementPost` / `PGConsentFormPost`. Matches `UploadingFile` in the
 * form reducer so edit-mode rehydration can splice these arrays directly
 * into form state without reshaping.
 */
export interface PGUploadedFile {
  localId: string;
  kind: 'file' | 'photo';
  name: string;
  size: number;
  mimeType: string;
  status: 'ready';
  attachmentId: number;
  url: string;
  thumbnailUrl?: string;
  isCover?: boolean;
}

export interface PGAnnouncementPost {
  /**
   * Discriminant for the `PGPost` union. `'announcement'` routes to
   * `/announcements`; `'form'` (on `PGConsentFormPost`) routes to `/consentForms`.
   */
  kind: 'announcement';
  id: AnnouncementId | AnnouncementDraftId;
  title: string;
  /** Plain-text derivation of `richTextContent`; kept for list/preview display. */
  description: string;
  /**
   * Raw Tiptap JSON document — the source-of-truth shape pgw sends and expects
   * on write. Null for summaries that only include the plain-text preview.
   */
  richTextContent?: Record<string, unknown> | null;
  status: PGStatus;
  responseType: ResponseType;
  ownership: PGOwnership;
  role?: 'owner' | 'viewer';
  recipients: PGRecipient[];
  stats: PGAnnouncementStats;
  postedAt?: string;
  scheduledAt?: string;
  createdAt?: string;
  createdBy: string;
  staffInCharge?: string;
  /** Numeric staff IDs returned by `staffOwners[].staffID`; used to rehydrate the staff selector in edit mode. */
  staffOwnerIds?: number[];
  /** Recipient targets returned by `target[]`; used to rehydrate the recipient selector in edit mode. */
  targets?: PGAnnouncementTarget[];
  enquiryEmail?: string;
  shortcuts?: PGShortcut[];
  websiteLinks?: PGWebsiteLink[];
  questions?: FormQuestion[];
  dueDate?: string;
  /** File attachments rehydrated from `detail.attachments`. */
  attachments?: PGUploadedFile[];
  /** Photos rehydrated from `detail.images` (if surfaced by the detail endpoint). */
  photos?: PGUploadedFile[];
  /**
   * Upstream-reported failure when a scheduled send could not be delivered.
   * `null` or `undefined` means the scheduled send is still on track (or the
   * post was never scheduled). A non-empty string — an opaque PG failure code
   * — surfaces as a red pill on the list row and a banner on the detail view.
   */
  scheduledSendFailureCode?: string | null;
}

// ─── Consent form variant ─────────────────────────────────────────────────────

/**
 * Reminder schedule on a consent form. Encoded as a 3-branch nested union so
 * `date` is present exactly when the branch needs it — never `type + optional
 * date`, which creates invalid nominal states (e.g. `NONE` with a date).
 *
 * The NONE branch carries an optional `lastDate` stash so the picker can
 * restore the user's previous date when they toggle NONE → ONE_TIME/DAILY.
 * It's not sent to PG — the outbound mapper only reads `date` on the active
 * branches.
 */
export type ReminderConfig =
  | { type: 'NONE'; lastDate?: string }
  | { type: 'ONE_TIME'; date: string }
  | { type: 'DAILY'; date: string };

/**
 * Event details on a consent form. Start/end/venue travel together — either
 * all three exist or none do. Encoded as an optional object rather than three
 * sibling optionals (which would allow 2³ nominal states; only 2 are valid).
 */
export interface PGEvent {
  start: string;
  end: string;
  venue?: string;
}

export type PGConsentFormHistoryEntry = PGApiConsentFormHistoryEntry;

/**
 * Per-student consent-form response. Distinct from `PGRecipient` (announcement
 * recipient) because announcements track read/unread while consent forms track
 * YES/NO/pending + respondedAt.
 */
export interface PGConsentFormRecipient {
  studentId: string;
  studentName: string;
  classLabel: string;
  response: 'YES' | 'NO' | null;
  respondedAt: string | null;
  /**
   * Onboarding state on the Parents Gateway side. Derived from
   * `PGApiConsentFormStudent.onBoardedCategory`: any non-empty category maps
   * to `'onboarded'`. Announcement recipients don't currently carry this
   * field (BFF doesn't surface it yet) — hence it's only on forms.
   */
  pgStatus: 'onboarded' | 'not-onboarded';
}

export interface PGConsentFormStats {
  totalCount: number;
  yesCount: number;
  noCount: number;
  /** Derived: `totalCount - yesCount - noCount`. */
  pendingCount: number;
}

export type PGConsentFormStatus = 'open' | 'closed' | 'posting' | 'scheduled' | 'draft';

export const PG_CONSENT_FORM_STATUS_BADGE: Record<
  PGConsentFormStatus,
  { label: string; variant: 'success' | 'info' | 'secondary' }
> = {
  open: { label: 'Open', variant: 'success' },
  closed: { label: 'Closed', variant: 'secondary' },
  posting: { label: 'Posting', variant: 'info' },
  scheduled: { label: 'Scheduled', variant: 'info' },
  draft: { label: 'Draft', variant: 'secondary' },
};

/**
 * Consent-form variant of `PGPost`. Carries everything a form needs on the
 * read-side: response type (Acknowledge or Yes/No), due date, reminder, event
 * details, custom questions, per-student responses, history.
 */
export interface PGConsentFormPost {
  kind: 'form';
  id: ConsentFormId | ConsentFormDraftId;
  title: string;
  description: string;
  richTextContent?: Record<string, unknown> | null;
  status: PGConsentFormStatus;
  /** Sub-type of consent form — the user-facing "response type" picker choice. */
  responseType: 'acknowledge' | 'yes-no';
  ownership: PGOwnership;
  role?: 'owner' | 'viewer';
  recipients: PGConsentFormRecipient[];
  stats: PGConsentFormStats;
  postedAt?: string;
  scheduledAt?: string;
  createdAt?: string;
  createdBy: string;
  staffInCharge?: string;
  staffOwnerIds?: number[];
  targets?: PGAnnouncementTarget[];
  enquiryEmail?: string;
  shortcuts?: PGShortcut[];
  websiteLinks?: PGWebsiteLink[];
  questions: FormQuestion[];
  consentByDate: string;
  reminder: ReminderConfig;
  event?: PGEvent;
  history: PGConsentFormHistoryEntry[];
  /** File attachments — detail contract currently omits this field on consent
   * forms (only `images` is exposed). Populated when the contract closes that
   * gap; today this stays undefined on consent-form reload. */
  attachments?: PGUploadedFile[];
  /** Photos rehydrated from consent-form detail `images`. */
  photos?: PGUploadedFile[];
  /** @see PGAnnouncementPost.scheduledSendFailureCode */
  scheduledSendFailureCode?: string | null;
}

/**
 * A post in the TW UI — either an announcement or a consent form. Pick the
 * endpoint, render shape, and payload mapper by narrowing on `kind`.
 */
export type PGPost = PGAnnouncementPost | PGConsentFormPost;

/**
 * Human-readable reasons keyed by the opaque PG failure-code strings surfaced
 * via `scheduledSendFailureCode`. The catalogue is best-effort — unknown codes
 * fall back to a generic label (see `describeScheduledSendFailure`). Extend
 * this dictionary as PG documents more reasons (ask #6 in
 * `docs/references/pg-team-asks.md`).
 */
export const SCHEDULED_FAILURE_REASON: Record<string, string> = {
  UPSTREAM_TIMEOUT: "The messaging service didn't respond in time.",
  RECIPIENT_INVALID: 'Some recipients are no longer valid.',
  ATTACHMENT_REJECTED: 'An attachment was blocked by virus scan.',
};

/**
 * Resolve a `scheduledSendFailureCode` into a plain-English sentence shown in
 * the detail-page banner. Returns `null` when there is no failure (the common
 * case). Unknown codes fall back to a generic apology so the teacher still
 * sees that something went wrong.
 */
export function describeScheduledSendFailure(code: string | null | undefined): string | null {
  if (!code) return null;
  return SCHEDULED_FAILURE_REASON[code] ?? 'Something went wrong on our side.';
}

/**
 * Pick the badge to render for a post in the list and on the detail header.
 * A scheduled send that has failed surfaces as a single destructive
 * "Send failed" pill — the misleading "Scheduled" pill is suppressed so the
 * teacher sees one consistent state.
 */
export function getPostStatusBadge(post: PGPost): { label: string; variant: BadgeVariant } {
  if (post.status === 'scheduled' && post.scheduledSendFailureCode) {
    return { label: 'Send failed', variant: 'destructive' };
  }
  return post.kind === 'form'
    ? PG_CONSENT_FORM_STATUS_BADGE[post.status]
    : PG_STATUS_BADGE[post.status];
}

/** @deprecated Use `PGAnnouncementPost`. */
export type PGAnnouncement = PGAnnouncementPost;

// ─── Branded IDs + type guards ────────────────────────────────────────────────

/**
 * Branded post ID types. `ConsentFormId` carries the `cf_` prefix PG uses in
 * its list envelope. `parsePostId` is the single entry point where a raw URL
 * string becomes a typed `PostId`; downstream code cannot call
 * `loadConsentFormDetail(announcementId)` by accident.
 */
export type AnnouncementId = string & { readonly __brand: 'AnnouncementId' };
export type AnnouncementDraftId = `annDraft_${string}` & {
  readonly __brand: 'AnnouncementDraftId';
};
export type ConsentFormId = `cf_${string}` & { readonly __brand: 'ConsentFormId' };
export type ConsentFormDraftId = `cfDraft_${string}` & { readonly __brand: 'ConsentFormDraftId' };
export type PostId = AnnouncementId | AnnouncementDraftId | ConsentFormId | ConsentFormDraftId;

export function isConsentFormId(id: PostId): id is ConsentFormId {
  return id.startsWith('cf_') && !id.startsWith('cfDraft_');
}

export function isAnnouncementDraftId(id: PostId): id is AnnouncementDraftId {
  return id.startsWith('annDraft_');
}

export function isConsentFormDraftId(id: PostId): id is ConsentFormDraftId {
  return id.startsWith('cfDraft_');
}

/**
 * Parse a raw URL segment into a typed `PostId`. Returns `null` for anything
 * that isn't a numeric announcement ID, a `cf_<digits>` consent-form ID, a
 * `cfDraft_<digits>` consent-form draft ID, or an `annDraft_<digits>` draft
 * announcement ID — callers treat that as a 404.
 *
 * More-specific prefixes are checked first so `cfDraft_` is not accidentally
 * matched by the `cf_` branch.
 */
export function parsePostId(raw: string): PostId | null {
  if (/^cfDraft_\d+$/.test(raw)) return raw as ConsentFormDraftId;
  if (/^cf_\d+$/.test(raw)) return raw as ConsentFormId;
  if (/^annDraft_\d+$/.test(raw)) return raw as AnnouncementDraftId;
  if (/^\d+$/.test(raw)) return raw as AnnouncementId;
  return null;
}

/**
 * Derive a `PostKind` from an already-parsed `PostId`. Preferred over raw
 * regex matching at call sites.
 */
export function postKindFromId(id: PostId): 'announcement' | 'form' {
  return isConsentFormId(id) || isConsentFormDraftId(id) ? 'form' : 'announcement';
}

/**
 * Build the canonical route URL for a post — detail or edit. Centralised here
 * so every caller stamps the same `?kind=` query string without manual
 * ternaries.
 */
export function postHref(post: PGPost, opts?: { edit?: boolean }): string {
  const base = opts?.edit ? `/posts/${post.id}/edit` : `/posts/${post.id}`;
  return `${base}?kind=${post.kind}`;
}

/**
 * Validate that the URL's `rawId` segment and `?kind=` query agree. Returns
 * the typed `PostId` when they match, `null` when the URL is self-contradictory
 * (e.g. `cf_123?kind=announcement`) — callers treat `null` as a 404.
 */
export function validatePostRoute(rawId: string, kindParam: string | null): PostId | null {
  const parsed = parsePostId(rawId);
  if (!parsed) return null;
  const isForm = isConsentFormId(parsed) || isConsentFormDraftId(parsed);
  if (kindParam === 'form' && !isForm) return null;
  if (kindParam === 'announcement' && isForm) return null;
  return parsed;
}
