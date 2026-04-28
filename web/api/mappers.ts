import type { UploadingFile } from '~/containers/CreatePostView';
import type {
  AnnouncementDraftId,
  AnnouncementId,
  ConsentFormDraftId,
  ConsentFormId,
  FormQuestion,
  PGAnnouncementPost,
  PGAnnouncementTarget,
  PGConsentFormHistoryEntry,
  PGConsentFormPost,
  PGConsentFormRecipient,
  PGConsentFormStatus,
  PGEvent,
  PGOwnership,
  PGRecipient,
  PGStatus,
  PGTargetType,
  ReminderConfig,
  ResponseType,
} from '~/data/mock-pg-announcements';
import { extractTextFromTiptap, textToTiptapDoc } from '~/helpers/tiptap';

import type {
  PGApiAnnouncementDetail,
  PGApiAnnouncementDraft,
  PGApiAnnouncementStatus,
  PGApiAnnouncementStudent,
  PGApiAnnouncementSummary,
  PGApiConsentFormDetail,
  PGApiConsentFormDraft,
  PGApiConsentFormStatus,
  PGApiConsentFormSummary,
  PGApiCreateAnnouncementPayload,
  PGApiCreateConsentFormDraftPayload,
  PGApiCreateConsentFormPayload,
  PGApiGroupTarget,
  PGApiReminderType,
} from './types';

/** Shared recipient fields for the announcement detail mapper. Consent forms
 *  use a nested `student` object and are mapped inline in `mapConsentFormDetail`. */
function buildRecipientBase(s: PGApiAnnouncementStudent) {
  return {
    studentId: String(s.studentId),
    studentName: s.studentName,
    classLabel: s.className,
  };
}

/**
 * Map a list-endpoint summary to a PGAnnouncementPost.
 * Fields the API doesn't provide (description, responseType, recipients, response stats)
 * are filled with safe defaults.
 */
export function mapAnnouncementSummary(
  api: PGApiAnnouncementSummary,
  ownership: PGOwnership,
): PGAnnouncementPost {
  const status = toPGStatus(api.status);
  const totalCount = api.readMetrics?.totalStudents ?? 0;
  const readCount = api.readMetrics
    ? Math.round(api.readMetrics.readPerStudent * api.readMetrics.totalStudents)
    : 0;

  // SCHEDULED posts live in `pg_announcement_draft` (status=SCHEDULED) — same
  // table as plain drafts. Brand both with `annDraft_` so the detail loader
  // routes to `/announcements/drafts/:id` (not `/announcements/:id`, which
  // 404s for unposted rows).
  const id =
    status === 'draft' || status === 'scheduled'
      ? (`annDraft_${api.postId}` as AnnouncementDraftId)
      : (String(api.postId) as AnnouncementId);

  return {
    kind: 'announcement',
    id,
    title: api.title,
    description: '',
    status,
    responseType: mapResponseType(api.responseType),
    ownership,
    recipients: [],
    stats: {
      totalCount,
      readCount,
      responseCount: 0,
      yesCount: 0,
      noCount: 0,
    },
    createdAt: api.date,
    createdBy: api.createdByName,
    scheduledSendFailureCode: api.scheduledSendFailureCode ?? null,
    // Route the single `date` field to the correct timestamp based on status
    ...(status === 'posted' && { postedAt: api.date }),
    ...(status === 'scheduled' && { scheduledAt: api.date }),
  };
}

/**
 * Rehydrate wire `attachments[]` into the form's `UploadingFile[]` file slot.
 * Identical shape on announcement and consent-form details — one helper keeps
 * the two mappers from drifting in how they materialise the same wire payload.
 */
function rehydrateAttachments(
  attachments:
    | {
        attachmentId: number;
        name: string;
        size: number;
        url: string;
      }[]
    | undefined,
): UploadingFile[] {
  return (attachments ?? []).map((a) => ({
    localId: `rehydrated-file-${a.attachmentId}`,
    kind: 'file' as const,
    name: a.name,
    size: a.size,
    mimeType: '',
    status: 'ready' as const,
    attachmentId: a.attachmentId,
    url: a.url,
  }));
}

/**
 * Rehydrate wire `images[]` into the form's `UploadingFile[]` photo slot,
 * preserving the reducer invariant that a non-empty photo list always has
 * exactly one `isCover: true`. PG may return images with no cover flagged
 * (draft-only; contract silent); promote the first entry so the submit
 * mapper and cover-radio UI never see a coverless list.
 */
function rehydratePhotos(
  images:
    | {
        imageId: number;
        name: string;
        size: number;
        url: string;
        thumbnailUrl?: string;
        isCover?: boolean;
      }[]
    | undefined,
): UploadingFile[] {
  const list = (images ?? []).map((img) => ({
    localId: `rehydrated-photo-${img.imageId}`,
    kind: 'photo' as const,
    name: img.name,
    size: img.size,
    mimeType: '',
    status: 'ready' as const,
    attachmentId: img.imageId,
    url: img.url,
    thumbnailUrl: img.thumbnailUrl,
    isCover: img.isCover,
  }));
  if (list.length === 0) return list;
  if (list.some((p) => p.isCover)) return list;
  return list.map((p, i) => ({ ...p, isCover: i === 0 }));
}

/**
 * Map the announcement-detail response to `PGAnnouncementPost`.
 *
 * The wire response (verified via curl 2026-04-23) differs from what our
 * declared type assumed — tolerate the drift defensively:
 * - `websiteLinks` → real field is `webLinkList`
 * - `status`/`responseType`/`scheduledSendAt` → null at the wire; derive
 * - `students[].readStatus` → real field (not `isRead`)
 * - `staffOwners`/`target`/`students` → treat as optional, default to `[]`
 */
export function mapAnnouncementDetail(detail: PGApiAnnouncementDetail): PGAnnouncementPost {
  // Detail endpoint doesn't always carry `status`; derive from date fields.
  const derivedStatus: PGStatus = detail.scheduledSendAt
    ? 'scheduled'
    : detail.postedDate
      ? 'posted'
      : 'draft';
  const status = detail.status ? toPGStatus(detail.status) : derivedStatus;

  const students = detail.students ?? [];
  const totalCount = students.length;
  const readCount = students.filter((s) => s.isRead || s.readStatus === 'READ').length;

  const recipients: PGRecipient[] = students.map((s) => ({
    ...buildRecipientBase(s),
    readStatus: s.isRead || s.readStatus === 'READ' ? ('read' as const) : ('unread' as const),
    respondedAt: undefined,
  }));

  // Preserve the raw Tiptap JSON so the edit-mode editor can hydrate with full
  // formatting; `description` stays as the plain-text derivation for previews.
  const richTextContent =
    detail.richTextContent && typeof detail.richTextContent === 'object'
      ? (detail.richTextContent as Record<string, unknown>)
      : null;

  const targetsRaw = detail.target ?? (detail as { targets?: typeof detail.target }).targets ?? [];
  const links = detail.webLinkList ?? detail.websiteLinks ?? [];
  const staffOwners = detail.staffOwners ?? [];

  return {
    kind: 'announcement',
    id: String(detail.announcementId) as AnnouncementId,
    title: detail.title,
    description: extractTextFromTiptap(detail.richTextContent),
    richTextContent,
    status,
    responseType: mapResponseType(detail.responseType),
    ownership: 'mine',
    recipients,
    stats: {
      totalCount,
      readCount,
      responseCount: 0,
      yesCount: 0,
      noCount: 0,
    },
    createdAt: detail.createdAt ?? undefined,
    createdBy: detail.staffName,
    postedAt: detail.postedDate ?? undefined,
    scheduledAt: detail.scheduledSendAt ?? undefined,
    scheduledSendFailureCode: detail.scheduledSendFailureCode ?? null,
    staffInCharge: staffOwners[0]?.staffName,
    staffOwnerIds: staffOwners.map((s) => s.staffID),
    targets: targetsRaw
      .map<PGAnnouncementTarget | null>((t) => {
        const type = toPGTargetType(t.targetType);
        return type ? { type, id: t.targetId, label: t.targetName } : null;
      })
      .filter((t): t is PGAnnouncementTarget => t !== null),
    enquiryEmail: detail.enquiryEmailAddress,
    websiteLinks: links.map((l) => ({ url: l.url, title: l.title })),
    attachments: rehydrateAttachments(detail.attachments),
    photos: rehydratePhotos(detail.images),
  };
}

/**
 * Map a draft-detail response to PGAnnouncementPost. Minimal field mapping for
 * the create/edit flow — populates title/richText/email so the form hydrates
 * on reload; recipients, staff, attachments are left empty because the
 * /announcements/drafts/:id response shape for those fields is not yet
 * documented (staffGroups/studentGroups arrays were empty in observed samples).
 * Extend as shapes become verifiable.
 */
export function mapAnnouncementDraftDetail(draft: PGApiAnnouncementDraft): PGAnnouncementPost {
  const richTextContent =
    draft.richTextContent && typeof draft.richTextContent === 'string'
      ? (JSON.parse(draft.richTextContent) as Record<string, unknown>)
      : null;

  return {
    kind: 'announcement',
    id: `annDraft_${draft.announcementDraftId}` as AnnouncementDraftId,
    title: draft.title,
    description: richTextContent ? extractTextFromTiptap(richTextContent) : '',
    richTextContent,
    status: 'draft',
    responseType: 'view-only',
    ownership: 'mine',
    recipients: [],
    stats: {
      totalCount: 0,
      readCount: 0,
      responseCount: 0,
      yesCount: 0,
      noCount: 0,
    },
    createdAt: draft.updatedAt,
    createdBy: '',
    scheduledAt: draft.scheduledDateTime ?? undefined,
  };
}

/**
 * Map a consent-form draft-detail response into the unified `PGConsentFormPost`
 * shape. Minimal mapping — populates title/richText/email/dueDate so the form
 * hydrates on reload. Recipients, staff, and attachments are left empty because
 * the `staffGroups`/`studentGroups` shape on the draft endpoint is not yet
 * documented (arrays were empty in observed samples). Extend as shapes become
 * verifiable. Mirrors `mapAnnouncementDraftDetail` in structure.
 */
export function mapConsentFormDraftDetail(draft: PGApiConsentFormDraft): PGConsentFormPost {
  // richTextContent arrives as a JSON-encoded string on the draft endpoint
  // (unlike the posted-form detail which can be an already-parsed object).
  const richTextContent =
    draft.richTextContent && typeof draft.richTextContent === 'string'
      ? (JSON.parse(draft.richTextContent) as Record<string, unknown>)
      : null;

  const addReminderType: PGApiReminderType =
    draft.addReminderType === 'ONE_TIME' || draft.addReminderType === 'DAILY'
      ? draft.addReminderType
      : 'NONE';

  return {
    kind: 'form',
    id: `cfDraft_${draft.consentFormDraftId}` as ConsentFormDraftId,
    title: draft.title,
    description: richTextContent ? extractTextFromTiptap(richTextContent) : '',
    richTextContent,
    status: 'draft',
    responseType: draft.responseType === 'YES_NO' ? 'yes-no' : 'acknowledge',
    ownership: 'mine',
    recipients: [],
    stats: {
      totalCount: 0,
      yesCount: 0,
      noCount: 0,
      pendingCount: 0,
    },
    createdAt: draft.updatedAt,
    createdBy: '',
    scheduledAt: draft.scheduledDateTime ?? undefined,
    enquiryEmail: draft.enquiryEmailAddress,
    consentByDate: draft.consentByDate ?? '',
    reminder: mapReminder(addReminderType, draft.reminderDate || null),
    questions: [],
    history: [],
  };
}

// Inbound `targetType` is sent lowercase by pgw-web (`class` | `group` | `cca` | `level`);
// normalize defensively in case future payloads upcase it.
const PG_TARGET_TYPE_MAP: Record<string, PGTargetType> = {
  class: 'class',
  group: 'group',
  cca: 'cca',
  level: 'level',
};

function toPGTargetType(raw: string): PGTargetType | null {
  return PG_TARGET_TYPE_MAP[raw.toLowerCase()] ?? null;
}

const PG_CONSENT_FORM_STATUS_MAP: Record<PGApiConsentFormStatus, PGConsentFormStatus> = {
  OPEN: 'open',
  CLOSED: 'closed',
  DRAFT: 'draft',
  POSTING: 'posting',
  SCHEDULED: 'scheduled',
};

function toPGConsentFormStatus(raw: PGApiConsentFormStatus): PGConsentFormStatus {
  return PG_CONSENT_FORM_STATUS_MAP[raw] ?? 'draft';
}

/**
 * The summary endpoint doesn't carry `responseType` or any form-only fields
 * beyond `consentByDate`; they get defaulted here and overwritten by the
 * detail mapper when the user opens a specific form.
 */
export function mapConsentFormSummaryToPost(
  api: PGApiConsentFormSummary,
  ownership: PGOwnership,
): PGConsentFormPost {
  const status = toPGConsentFormStatus(api.status);
  const totalCount = api.respondedMetrics?.totalStudents ?? 0;
  const respondedCount = api.respondedMetrics
    ? Math.round(api.respondedMetrics.respondedPerStudent * totalCount)
    : 0;

  // SCHEDULED forms live in the consent-form draft table — brand them as
  // `cfDraft_` so the detail loader hits `/consentForms/drafts/:id`.
  const id =
    status === 'draft' || status === 'scheduled'
      ? (`cfDraft_${api.postId}` as ConsentFormDraftId)
      : (`cf_${api.postId}` as ConsentFormId);

  return {
    kind: 'form',
    id,
    title: api.title,
    description: '',
    status,
    // Summary endpoint is silent on response sub-type; detail fetch will set this.
    responseType: 'yes-no',
    ownership,
    recipients: [],
    stats: {
      totalCount,
      yesCount: 0,
      noCount: 0,
      pendingCount: Math.max(totalCount - respondedCount, 0),
    },
    createdAt: api.date,
    createdBy: api.createdByName,
    scheduledSendFailureCode: api.scheduledSendFailureCode ?? null,
    consentByDate: api.consentByDate ?? '',
    reminder: { type: 'NONE' },
    questions: [],
    history: [],
    // Route the single `date` field to the correct timestamp by status.
    ...((status === 'open' || status === 'closed') && { postedAt: api.date }),
    ...(status === 'scheduled' && { scheduledAt: api.date }),
  };
}

const CONSENT_FORM_RESPONSE_TYPE_MAP: Record<string, PGConsentFormPost['responseType']> = {
  ACKNOWLEDGE: 'acknowledge',
  ACKNOWLEDGEMENT: 'acknowledge',
  YES_NO: 'yes-no',
};

function mapConsentFormResponseType(raw: string): PGConsentFormPost['responseType'] {
  return CONSENT_FORM_RESPONSE_TYPE_MAP[raw] ?? 'yes-no';
}

export function mapReminder(type: PGApiReminderType, date: string | null): ReminderConfig {
  if (type !== 'ONE_TIME' && type !== 'DAILY') return { type: 'NONE' };
  if (!date) return { type: 'NONE' };
  // Tolerate both bare YYYY-MM-DD and ISO timestamp shapes from PGW.
  const datePart = date.includes('T') ? date.slice(0, 10) : date;
  return { type, date: datePart };
}

/**
 * Map a consent-form detail response into the unified `PGConsentFormPost`
 * shape the TW UI consumes.
 */
export function mapConsentFormDetail(detail: PGApiConsentFormDetail): PGConsentFormPost {
  // Detail endpoint doesn't carry `status`; derive from posting/due dates.
  // - postedDate set + consentByDate in future → OPEN
  // - postedDate set + consentByDate passed → CLOSED
  // - no postedDate → DRAFT (shouldn't reach here, but safe fallback)
  const now = Date.now();
  const dueAt = detail.consentByDate ? Date.parse(detail.consentByDate) : NaN;
  const status: PGConsentFormStatus = detail.postedDate
    ? Number.isFinite(dueAt) && dueAt < now
      ? 'closed'
      : 'open'
    : 'draft';

  const recipientRows = detail.consentFormRecipients ?? [];
  const totalCount = recipientRows.length;
  const yesCount = recipientRows.filter((r) => r.reply === 'YES').length;
  const noCount = recipientRows.filter((r) => r.reply === 'NO').length;

  const recipients: PGConsentFormRecipient[] = recipientRows.map((r) => ({
    studentId: String(r.student.studentId),
    studentName: r.student.studentName,
    classLabel: r.student.className,
    response: r.reply,
    respondedAt: r.replyDate,
    pgStatus: r.onBoardedCategory && r.onBoardedCategory.length > 0 ? 'onboarded' : 'not-onboarded',
  }));

  const richTextContent =
    detail.richTextContent && typeof detail.richTextContent === 'object'
      ? (detail.richTextContent as Record<string, unknown>)
      : null;

  const event =
    detail.eventStartDate && detail.eventEndDate
      ? {
          start: detail.eventStartDate,
          end: detail.eventEndDate,
          ...(detail.venue && { venue: detail.venue }),
        }
      : undefined;

  const questions = (detail.customQuestions ?? []).map<PGConsentFormPost['questions'][number]>(
    (q) =>
      q.type === 'MCQ'
        ? {
            id: String(q.questionId),
            text: q.text,
            type: 'mcq',
            options: (q.options && q.options.length > 0 ? q.options : ['']) as [
              string,
              ...string[],
            ],
          }
        : {
            id: String(q.questionId),
            text: q.text,
            type: 'free-text',
          },
  );

  const history: PGConsentFormHistoryEntry[] = detail.consentFormHistory ?? [];

  return {
    kind: 'form',
    id: `cf_${detail.consentFormId}` as ConsentFormId,
    title: detail.title,
    description: extractTextFromTiptap(detail.richTextContent),
    richTextContent,
    status,
    responseType: mapConsentFormResponseType(detail.responseType),
    ownership: 'mine',
    recipients,
    stats: {
      totalCount,
      yesCount,
      noCount,
      pendingCount: Math.max(totalCount - yesCount - noCount, 0),
    },
    createdAt: detail.createdAt ?? undefined,
    createdBy: detail.staffName,
    postedAt: detail.postedDate ?? undefined,
    staffInCharge: detail.staffOwners[0]?.staffName,
    staffOwnerIds: detail.staffOwners.map((s) => s.staffID),
    targets: (detail.targets ?? [])
      .map<PGAnnouncementTarget | null>((t) => {
        const type = toPGTargetType(t.targetType);
        return type ? { type, id: t.targetId, label: t.targetName } : null;
      })
      .filter((t): t is PGAnnouncementTarget => t !== null),
    enquiryEmail: detail.enquiryEmailAddress,
    questions,
    consentByDate: detail.consentByDate ?? '',
    reminder: mapReminder(detail.addReminderType, detail.reminderDate),
    event,
    history,
    websiteLinks: (detail.webLinkList ?? []).map((l) => ({ url: l.url, title: l.title })),
    attachments: rehydrateAttachments(detail.attachments),
    photos: rehydratePhotos(detail.images),
  };
}

/**
 * Merge own and shared announcements, deduplicating by ID.
 * Own posts take priority (ownership: 'mine').
 */
export function mergeAndDedup<T extends { id: string }>(own: T[], shared: T[]): T[] {
  const ownIds = new Set(own.map((a) => a.id));
  return [...own, ...shared.filter((a) => !ownIds.has(a.id))];
}

const RESPONSE_TYPE_MAP: Record<string, ResponseType> = {
  VIEW_ONLY: 'view-only',
  ACKNOWLEDGE: 'acknowledge',
  YES_NO: 'yes-no',
};

function mapResponseType(apiType?: string | null): ResponseType {
  if (!apiType) return 'view-only';
  return RESPONSE_TYPE_MAP[apiType] ?? 'view-only';
}

const PG_STATUS_MAP: Record<PGApiAnnouncementStatus, PGStatus> = {
  POSTED: 'posted',
  SCHEDULED: 'scheduled',
  POSTING: 'posting',
  DRAFT: 'draft',
};

function toPGStatus(raw: PGApiAnnouncementStatus): PGStatus {
  return PG_STATUS_MAP[raw] ?? 'draft';
}

// ─── Outbound: FE payload → pgw-web schema ──────────────────────────────────
// FE collects recipients grouped (classIds / customGroupIds / ccaIds / levelIds)
// because that's what the form needs; pgw-web's API takes them as a flat
// `targets` array. Other field renames mirror the read-side envelope fix.
//
// Field-level allowlist is enforced at compile time via `satisfies`: if the
// wire DTO gains a new required field and the mapper doesn't populate it, the
// build fails. Unknown fields on the input side don't reach the wire.

/**
 * PGW's exact wire-side write payload. Field names match what
 * `announcement-draft.service.ts#announcementDraftCreateUpdateSchema` and
 * the corresponding consent-form schema accept. PGW's schedule controllers
 * validate without `allowUnknown: true`, so unknown keys are rejected
 * outright — every field name here has to mirror PGW exactly.
 */
interface PGWritePayload {
  title: string;
  content: string;
  enquiryEmailAddress: string;
  studentGroups: PGApiGroupTarget[];
  staffGroups?: PGApiGroupTarget[];
  urls?: { webLink: string; linkDescription: string }[];
  shortcuts?: string[];
}

/** Shape for `POST /consentForms` (publish). PGW uses ISO strings for event
 *  dates here — different from the draft shape. See
 *  `pgw-web/src/server/apiv2/staff/controllers/consent-form/create.staff.consent-form.controller.ts`. */
interface PGConsentFormPublishPayload extends PGWritePayload {
  responseType: 'ACKNOWLEDGEMENT' | 'YES_NO';
  consentByDate: string;
  addReminderType: PGApiReminderType;
  reminderDate?: string | null;
  startDateTime?: string | null;
  endDateTime?: string | null;
  venue?: string | null;
}

/** Shape for `POST /consentForms/drafts` and PUT update. PGW uses
 *  `{ date, time }` objects for event dates. See
 *  `pgw-web/src/server/modules/consent-form/consent-form-draft.service.ts#L326`. */
interface PGConsentFormDraftWritePayload extends PGWritePayload {
  responseType: 'ACKNOWLEDGEMENT' | 'YES_NO';
  consentByDate: string;
  addReminderType: PGApiReminderType;
  reminderDate?: string | null;
  eventStartDate?: { date: string; time: string } | null;
  eventEndDate?: { date: string; time: string } | null;
  venue?: string | null;
}

export function toPGCreatePayload(
  p: PGApiCreateAnnouncementPayload,
  opts: { allowPartial?: boolean } = {},
): PGWritePayload {
  if (!p.enquiryEmailAddress && !opts.allowPartial) {
    throw new Error('enquiryEmailAddress is required');
  }
  return {
    title: p.title,
    content: p.richTextContent,
    enquiryEmailAddress: p.enquiryEmailAddress ?? '',
    studentGroups: p.studentGroups,
    staffGroups: p.staffGroups,
    urls: p.websiteLinks?.map((l) => ({ webLink: l.url, linkDescription: l.title })),
    shortcuts: p.shortcutLink,
  } satisfies PGWritePayload;
}

function dateTimeToIso(dt: { date: string; time: string } | null | undefined): string | null {
  if (!dt) return null;
  return `${dt.date}T${dt.time}:00+08:00`;
}

export function toPGConsentFormCreatePayload(
  p: PGApiCreateConsentFormPayload,
): PGConsentFormPublishPayload {
  if (!p.enquiryEmailAddress) {
    throw new Error('enquiryEmailAddress is required');
  }
  return {
    title: p.title,
    content: p.richTextContent,
    enquiryEmailAddress: p.enquiryEmailAddress,
    studentGroups: p.studentGroups,
    staffGroups: p.staffGroups,
    urls: p.websiteLinks?.map((l) => ({ webLink: l.url, linkDescription: l.title })),
    shortcuts: p.shortcutLink,
    responseType: p.responseType,
    consentByDate: p.consentByDate,
    addReminderType: p.addReminderType,
    reminderDate: p.reminderDate,
    startDateTime: dateTimeToIso(p.eventStartDate),
    endDateTime: dateTimeToIso(p.eventEndDate),
    venue: p.venue,
  } satisfies PGConsentFormPublishPayload;
}

export function toPGConsentFormDraftPayload(
  p: PGApiCreateConsentFormDraftPayload,
): PGConsentFormDraftWritePayload {
  return {
    title: p.title,
    content: p.richTextContent,
    enquiryEmailAddress: p.enquiryEmailAddress ?? '',
    studentGroups: p.studentGroups,
    staffGroups: p.staffGroups,
    urls: p.websiteLinks?.map((l) => ({ webLink: l.url, linkDescription: l.title })),
    shortcuts: p.shortcutLink,
    responseType: p.responseType,
    consentByDate: p.consentByDate,
    addReminderType: p.addReminderType,
    reminderDate: p.reminderDate,
    eventStartDate: p.eventStartDate,
    eventEndDate: p.eventEndDate,
    venue: p.venue,
  } satisfies PGConsentFormDraftWritePayload;
}

// ─── Post-creation dispatcher ───────────────────────────────────────────────
// `buildPostPayload` is the single boundary where the container's collected
// form-state becomes a wire-ready write payload. It narrows on `kind` and
// routes to either the announcement or consent-form builder. SGT ISO
// conversion for `datetime-local` and bare-date strings happens here so the
// section components can stay format-agnostic.

/**
 * Convert a `<input type="datetime-local">` string (`YYYY-MM-DDTHH:MM`, naive
 * local time) into an ISO-8601 anchored to Asia/Singapore (+08:00). Mirrors
 * `SchedulePickerDialog.toSgtIso` — the naive string is interpreted as SGT
 * rather than the browser's local TZ, which matches teacher expectations.
 *
 * Constraint: callers must surface this SGT-anchor assumption to the user
 * (the datetime inputs carry an "(SGT)" suffix). A teacher on a non-SGT
 * browser typing "09:00" will have it stamped as `09:00+08:00` — numerically
 * lossless on round-trip, but they should know they're picking SGT time.
 */
/**
 * Split a local `YYYY-MM-DDTHH:mm` datetime into PGW's expected
 * `{ date: 'YYYY-MM-DD', time: 'HH:mm' }` shape for consent-form event fields.
 * Returns `null` for an unparseable / empty input so callers can pass it
 * straight into the wire payload.
 */
function splitLocalDateTime(localDateTime: string): { date: string; time: string } | null {
  const [datePart, timePart] = localDateTime.split('T');
  if (!datePart || !timePart) return null;
  const [hh, mm] = timePart.split(':');
  const hhPadded = (hh ?? '00').padStart(2, '0');
  const mmPadded = (mm ?? '00').padStart(2, '0');
  return { date: datePart, time: `${hhPadded}:${mmPadded}` };
}

/**
 * Convert a `<input type="date">` string (`YYYY-MM-DD`) into an ISO-8601
 * anchored to end-of-day SGT (`23:59:59+08:00`). Matches the fixture
 * convention for `consentByDate` / `reminderDate` (`T15:59:59.000Z`).
 *
 * TODO (Phase 2 contract ambiguity): PG hasn't confirmed whether the anchor
 * time matters for reminder delivery. End-of-day is the safe default — a
 * reminder "on March 29" fires before March 29 23:59 SGT, which is the
 * intuitive meaning.
 */
function localDateToSgtIso(localDate: string): string {
  return `${localDate}T23:59:59+08:00`;
}

/** Subset of the container's `PostFormState` that the dispatcher consumes. */
interface BuildPostPayloadInput {
  kind: 'announcement' | 'form';
  title: string;
  /** Plain-text derivation of `descriptionDoc`. */
  description: string;
  descriptionDoc: Record<string, unknown> | null;
  enquiryEmail: string;
  selectedRecipients: {
    id: string;
    label: string;
    /** Widened to `string` (via the full `SelectedEntity.groupType` domain)
     * so this input type is assignable from the container's reducer state.
     * `selectedToStudentGroups` maps known FE group types into PGW's
     * `studentGroups[].type` enum (`class | level | school | cca | group`),
     * defaulting to `group` for anything unrecognised. */
    groupType?: string;
  }[];
  selectedStaff: { id: string; label: string }[];
  responseType: ResponseType;
  questions: FormQuestion[];
  dueDate: string;
  reminder: ReminderConfig;
  event?: PGEvent;
  venue?: string;
  /** `webLinkList` source. Forwarded identically for both kinds. */
  websiteLinks: { url: string; title: string }[];
  /** PG shortcut keys the teacher ticked. Forwarded as `shortcutLink[]`. */
  shortcuts: string[];
  /** File uploads — mapped to `attachments` on the write payload. */
  attachments: UploadingFile[];
  /** Photo uploads — mapped to `images` on the write payload. */
  photos: UploadingFile[];
}

/**
 * Project ready-status file uploads into the PG `attachments[]` wire shape.
 * Errored/in-flight rows are dropped — the caller must gate submit via
 * `hasPendingUploads` before reaching here.
 */
function mapReadyAttachments(attachments: UploadingFile[]) {
  return attachments
    .filter((a) => a.status === 'ready' && a.attachmentId != null && a.url)
    .map((a) => ({
      attachmentId: a.attachmentId!,
      name: a.name,
      size: a.size,
      url: a.url!,
    }));
}

/**
 * Project ready-status photos into the PG `images[]` wire shape. Ensures at
 * least one photo carries `isCover: true` (defensive — the reducer already
 * maintains this invariant, but the mapper is the wire boundary).
 */
function mapReadyPhotos(photos: UploadingFile[]) {
  const ready = photos.filter((p) => p.status === 'ready' && p.attachmentId != null && p.url);
  if (ready.length === 0) return undefined;
  const hasCover = ready.some((p) => p.isCover);
  return ready.map((p, i) => ({
    imageId: p.attachmentId!,
    isCover: p.isCover ?? (!hasCover && i === 0),
    name: p.name,
    size: p.size,
    thumbnailUrl: p.thumbnailUrl ?? p.url!,
    url: p.url!,
  }));
}

/**
 * Drop empty rows (user opened an extra row then left it blank) and return
 * `undefined` when nothing is left so the wire payload stays sparse. PG
 * treats the `webLinkList` field as optional; sending `[]` renders an empty
 * section in some clients.
 */
function pruneWebsiteLinks(
  links: BuildPostPayloadInput['websiteLinks'],
): PGApiCreateAnnouncementPayload['websiteLinks'] {
  const filtered = links.filter((l) => l.url.trim().length > 0 || l.title.trim().length > 0);
  if (filtered.length === 0) return undefined;
  return filtered.map((l) => ({ url: l.url.trim(), title: l.title.trim() }));
}

/**
 * Map our internal `GroupType` (carried on `SelectedEntity.groupType`) to the
 * value PGW expects in the `studentGroups[].type` field. PGW's
 * `ETargetType` enum: `school | level | class | group | cca | student`.
 * Unknown FE group types fall back to `'group'` to keep PGW's strict-schema
 * validator happy.
 */
const GROUP_TYPE_TO_PGW: Record<string, string> = {
  class: 'class',
  level: 'level',
  school: 'school',
  cca: 'cca',
  custom: 'group',
  teaching: 'group',
  department: 'group',
  'staff-group': 'group',
};

function selectedToStudentGroups(
  selected: BuildPostPayloadInput['selectedRecipients'],
): PGApiGroupTarget[] {
  return selected
    .map((s) => ({
      type: GROUP_TYPE_TO_PGW[s.groupType ?? 'custom'] ?? 'group',
      label: s.label,
      value: Number(s.id),
    }))
    .filter((g) => !Number.isNaN(g.value));
}

function selectedToStaffGroups(
  selected: BuildPostPayloadInput['selectedStaff'],
): PGApiGroupTarget[] {
  // Today the staff selector only surfaces individuals (per PGTW-7 scope —
  // Level/School staff data isn't exposed by the school endpoints). When
  // those tabs come online, fold them in here with the right `type`.
  return selected
    .map((s) => ({ type: 'individual', label: s.label, value: Number(s.id) }))
    .filter((g) => !Number.isNaN(g.value));
}

// FE response types → PG wire enum. Acknowledge maps to the singular
// `ACKNOWLEDGEMENT` on the write side (see `PGApiCreateConsentFormPayload`).
const FE_TO_PG_CONSENT_RESPONSE_TYPE: Record<
  'acknowledge' | 'yes-no',
  'ACKNOWLEDGEMENT' | 'YES_NO'
> = {
  acknowledge: 'ACKNOWLEDGEMENT',
  'yes-no': 'YES_NO',
};

export function buildAnnouncementPayload(
  state: BuildPostPayloadInput,
): PGApiCreateAnnouncementPayload {
  const doc = state.descriptionDoc ?? textToTiptapDoc(state.description);
  const attachments = mapReadyAttachments(state.attachments);
  const images = mapReadyPhotos(state.photos);
  return {
    title: state.title,
    richTextContent: JSON.stringify(doc),
    enquiryEmailAddress: state.enquiryEmail,
    studentGroups: selectedToStudentGroups(state.selectedRecipients),
    staffGroups: selectedToStaffGroups(state.selectedStaff),
    websiteLinks: pruneWebsiteLinks(state.websiteLinks),
    shortcutLink: state.shortcuts.length > 0 ? state.shortcuts : undefined,
    ...(attachments.length > 0 && { attachments }),
    ...(images && { images }),
  } satisfies PGApiCreateAnnouncementPayload;
}

export function buildConsentFormPayload(
  state: BuildPostPayloadInput,
): PGApiCreateConsentFormPayload {
  const doc = state.descriptionDoc ?? textToTiptapDoc(state.description);
  if (state.responseType === 'view-only') {
    // Consent forms never carry `view-only`; the container's type-picker
    // seeds `acknowledge` when the user picks post-with-response. Guard here
    // defensively so a bad state change surfaces a clear error rather than
    // an opaque 400 from pgw.
    throw new Error(
      'Consent forms require responseType of `acknowledge` or `yes-no`, got `view-only`.',
    );
  }
  const responseType = FE_TO_PG_CONSENT_RESPONSE_TYPE[state.responseType];
  // PGW's consent-form schema accepts empty strings for reminderDate /
  // consentByDate / venue, but event dates must be `{ date, time }` or null
  // (Joi rejects `""` with "eventStartDate is not allowed"). See
  // `pgw-web/src/server/modules/consent-form/consent-form-draft.service.ts`.
  const reminderDate =
    state.reminder.type === 'NONE' ? '' : (localDateToSgtIso(state.reminder.date) ?? '');
  const eventStartDate = state.event ? splitLocalDateTime(state.event.start) : null;
  const eventEndDate = state.event ? splitLocalDateTime(state.event.end) : null;
  const consentByDate = state.dueDate.trim() ? (localDateToSgtIso(state.dueDate) ?? '') : '';
  // Venue is tracked both on `state.venue` (independently editable) and as a
  // child of `state.event.venue` when PGEvent is populated. Prefer the
  // free-standing field so a user can type a venue before setting dates.
  const venue = state.venue?.trim() ? state.venue.trim() : (state.event?.venue ?? '');
  const customQuestions = state.questions.length
    ? state.questions.map((q) =>
        q.type === 'mcq'
          ? {
              questionId: 0,
              type: 'MCQ' as const,
              text: q.text,
              options: q.options,
            }
          : {
              questionId: 0,
              type: 'FREE_TEXT' as const,
              text: q.text,
            },
      )
    : undefined;
  const attachments = mapReadyAttachments(state.attachments);
  const images = mapReadyPhotos(state.photos);
  return {
    title: state.title,
    richTextContent: JSON.stringify(doc),
    enquiryEmailAddress: state.enquiryEmail,
    responseType,
    consentByDate,
    addReminderType: state.reminder.type,
    reminderDate,
    eventStartDate,
    eventEndDate,
    venue,
    studentGroups: selectedToStudentGroups(state.selectedRecipients),
    staffGroups: selectedToStaffGroups(state.selectedStaff),
    customQuestions,
    websiteLinks: pruneWebsiteLinks(state.websiteLinks),
    shortcutLink: state.shortcuts.length > 0 ? state.shortcuts : undefined,
    ...(attachments.length > 0 && { attachments }),
    ...(images && { images }),
  } satisfies PGApiCreateConsentFormPayload;
}

export type { BuildPostPayloadInput };
