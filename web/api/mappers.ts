import type {
  FormQuestion,
  PGAnnouncement,
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

import type {
  PGApiAnnouncementDetail,
  PGApiAnnouncementStatus,
  PGApiAnnouncementSummary,
  PGApiConsentFormDetail,
  PGApiConsentFormStatus,
  PGApiConsentFormSummary,
  PGApiCreateAnnouncementPayload,
  PGApiCreateConsentFormDraftPayload,
  PGApiCreateConsentFormPayload,
  PGApiReminderType,
} from './types';

/**
 * Map a list-endpoint summary to a PGAnnouncement.
 * Fields the API doesn't provide (description, responseType, recipients, response stats)
 * are filled with safe defaults.
 */
export function mapAnnouncementSummary(
  api: PGApiAnnouncementSummary,
  ownership: PGOwnership,
): PGAnnouncement {
  const status = toPGStatus(api.status);
  const totalCount = api.readMetrics?.totalStudents ?? 0;
  const readCount = api.readMetrics
    ? Math.round(api.readMetrics.readPerStudent * api.readMetrics.totalStudents)
    : 0;

  return {
    kind: 'announcement',
    id: String(api.postId),
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
    // Route the single `date` field to the correct timestamp based on status
    ...(status === 'posted' && { postedAt: api.date }),
    ...(status === 'scheduled' && { scheduledAt: api.date }),
  };
}

/**
 * PG's detail embeds read status on `students[].isRead`; per-student `readAt`
 * is not exposed by PG, so `respondedAt` is left undefined.
 */
export function mapAnnouncementDetail(detail: PGApiAnnouncementDetail): PGAnnouncement {
  const status = toPGStatus(detail.status);
  const totalCount = detail.students.length;
  const readCount = detail.students.filter((s) => s.isRead).length;

  const recipients: PGRecipient[] = detail.students.map((s) => ({
    studentId: String(s.studentId),
    studentName: s.studentName,
    readStatus: s.isRead ? ('read' as const) : ('unread' as const),
    respondedAt: undefined,
    classLabel: s.className,
  }));

  // Preserve the raw Tiptap JSON so the edit-mode editor can hydrate with full
  // formatting; `description` stays as the plain-text derivation for previews.
  const richTextContent =
    detail.richTextContent && typeof detail.richTextContent === 'object'
      ? (detail.richTextContent as Record<string, unknown>)
      : null;

  return {
    kind: 'announcement',
    id: String(detail.announcementId),
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
    staffInCharge: detail.staffOwners[0]?.staffName,
    staffOwnerIds: detail.staffOwners.map((s) => s.staffID),
    targets: detail.target
      .map<PGAnnouncementTarget | null>((t) => {
        const type = toPGTargetType(t.targetType);
        return type ? { type, id: t.targetId, label: t.targetName } : null;
      })
      .filter((t): t is PGAnnouncementTarget => t !== null),
    enquiryEmail: detail.enquiryEmailAddress,
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

/**
 * Map a consent form summary from the API to a list item with ownership.
 * @deprecated Use `mapConsentFormSummaryToPost` for the unified Posts list.
 */
export function mapConsentFormSummary(
  api: PGApiConsentFormSummary,
  ownership: 'mine' | 'shared',
): PGApiConsentFormSummary & { ownership: 'mine' | 'shared' } {
  return { ...api, ownership };
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

  return {
    kind: 'form',
    id: api.id,
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

function mapReminder(type: PGApiReminderType, date: string | null): ReminderConfig {
  if (type === 'NONE' || !date) return { type: 'NONE' };
  return { type, date };
}

/**
 * Map a consent-form detail response into the unified `PGConsentFormPost`
 * shape the TW UI consumes.
 */
export function mapConsentFormDetail(detail: PGApiConsentFormDetail): PGConsentFormPost {
  const status = toPGConsentFormStatus(detail.status);
  const totalCount = detail.students.length;
  const yesCount = detail.students.filter((s) => s.response === 'YES').length;
  const noCount = detail.students.filter((s) => s.response === 'NO').length;

  const recipients: PGConsentFormRecipient[] = detail.students.map((s) => ({
    studentId: String(s.studentId),
    studentName: s.studentName,
    classLabel: s.className,
    response: s.response,
    respondedAt: s.respondedAt,
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

  const questions = detail.customQuestions.map<PGConsentFormPost['questions'][number]>((q) =>
    q.type === 'MCQ'
      ? {
          id: String(q.questionId),
          text: q.text,
          type: 'mcq',
          options: (q.options && q.options.length > 0 ? q.options : ['']) as [string, ...string[]],
        }
      : {
          id: String(q.questionId),
          text: q.text,
          type: 'free-text',
        },
  );

  const history: PGConsentFormHistoryEntry[] = detail.consentFormHistory;

  return {
    kind: 'form',
    id: `cf_${detail.consentFormId}`,
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
    enquiryEmail: detail.enquiryEmailAddress,
    questions,
    consentByDate: detail.consentByDate ?? '',
    reminder: mapReminder(detail.addReminderType, detail.reminderDate),
    event,
    history,
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

function mapResponseType(apiType?: string): ResponseType {
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

/**
 * Extract plain text from a Tiptap doc.
 * PG sends it as a parsed object; legacy fixtures may send a JSON string.
 */
function extractTextFromTiptap(rich: Record<string, unknown> | string | null | undefined): string {
  if (rich == null) return '';
  if (typeof rich === 'string') {
    try {
      return extractText(JSON.parse(rich) as TiptapNode).trim();
    } catch {
      return rich.trim();
    }
  }
  return extractText(rich).trim();
}

interface TiptapNode {
  type?: string;
  content?: TiptapNode[];
  text?: string;
}

function extractText(node: TiptapNode): string {
  if (typeof node.text === 'string') return node.text;
  if (!Array.isArray(node.content)) return '';

  const parts = node.content.map(extractText);
  return node.type === 'doc' ? parts.join('\n') : parts.join('');
}

// ─── Outbound: FE payload → pgw-web schema ──────────────────────────────────
// FE collects recipients grouped (classIds / customGroupIds / ccaIds / levelIds)
// because that's what the form needs; pgw-web's API takes them as a flat
// `targets` array. Other field renames mirror the read-side envelope fix.
//
// Field-level allowlist is enforced at compile time via `satisfies`: if the
// wire DTO gains a new required field and the mapper doesn't populate it, the
// build fails. Unknown fields on the input side don't reach the wire.

interface PGTarget {
  targetType: PGTargetType;
  targetId: number;
}

interface PGWritePayload {
  title: string;
  content: string;
  enquiryEmailAddress: string;
  targets: PGTarget[];
  staffInCharge?: number[];
  webLinkList?: { webLink: string; linkDescription: string }[];
}

interface PGConsentFormWritePayload extends PGWritePayload {
  responseType: 'ACKNOWLEDGEMENT' | 'YES_NO';
  consentByDate: string;
  addReminderType: PGApiReminderType;
  reminderDate?: string | null;
  eventStartDate?: string | null;
  eventEndDate?: string | null;
  venue?: string | null;
  customQuestions?: { questionText: string; questionType: 'TEXT' | 'MCQ'; options?: string[] }[];
  scheduledSendAt?: string | null;
}

function buildTargets(r: PGApiCreateAnnouncementPayload['recipients']): PGTarget[] {
  return [
    ...r.classIds.map((targetId) => ({ targetType: 'class' as const, targetId })),
    ...r.customGroupIds.map((targetId) => ({ targetType: 'group' as const, targetId })),
    ...r.ccaIds.map((targetId) => ({ targetType: 'cca' as const, targetId })),
    ...r.levelIds.map((targetId) => ({ targetType: 'level' as const, targetId })),
  ];
}

export function toPGCreatePayload(p: PGApiCreateAnnouncementPayload): PGWritePayload {
  if (!p.enquiryEmailAddress) {
    throw new Error('enquiryEmailAddress is required');
  }
  return {
    title: p.title,
    content: p.richTextContent,
    enquiryEmailAddress: p.enquiryEmailAddress,
    targets: buildTargets(p.recipients),
    staffInCharge: p.staffOwnerIds,
    webLinkList: p.websiteLinks?.map((l) => ({ webLink: l.url, linkDescription: l.title })),
  } satisfies PGWritePayload;
}

export function toPGConsentFormCreatePayload(
  p: PGApiCreateConsentFormPayload,
): PGConsentFormWritePayload {
  if (!p.enquiryEmailAddress) {
    throw new Error('enquiryEmailAddress is required');
  }
  return {
    title: p.title,
    content: p.richTextContent,
    enquiryEmailAddress: p.enquiryEmailAddress,
    targets: buildTargets(p.recipients),
    staffInCharge: p.staffOwnerIds,
    webLinkList: p.websiteLinks?.map((l) => ({ webLink: l.url, linkDescription: l.title })),
    responseType: p.responseType,
    consentByDate: p.consentByDate,
    addReminderType: p.addReminderType,
    reminderDate: p.reminderDate,
    eventStartDate: p.eventStartDate,
    eventEndDate: p.eventEndDate,
    venue: p.venue,
    customQuestions: p.customQuestions?.map((q) => ({
      questionText: q.text,
      questionType: q.type === 'MCQ' ? 'MCQ' : 'TEXT',
      ...(q.options && { options: q.options }),
    })),
  } satisfies PGConsentFormWritePayload;
}

export function toPGConsentFormDraftPayload(
  p: PGApiCreateConsentFormDraftPayload,
): PGConsentFormWritePayload {
  return {
    ...toPGConsentFormCreatePayload(p),
    scheduledSendAt: p.scheduledSendAt,
  } satisfies PGConsentFormWritePayload;
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
 */
function localDateTimeToSgtIso(localDateTime: string): string {
  const [datePart, timePart] = localDateTime.split('T');
  if (!datePart || !timePart) return localDateTime;
  const [hh, mm] = timePart.split(':');
  const hhPadded = (hh ?? '00').padStart(2, '0');
  const mmPadded = (mm ?? '00').padStart(2, '0');
  return `${datePart}T${hhPadded}:${mmPadded}:00+08:00`;
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
    /** Widened to `string` (via the full `SelectedEntity.groupType` domain)
     * so this input type is assignable from the container's reducer state.
     * `groupRecipients` routes `class` / `custom` / `cca` / `level`; all
     * other group types (e.g. `staff-group`, `school`) are dropped — the FE
     * payload doesn't yet accept them. */
    groupType?: string;
  }[];
  selectedStaff: { id: string }[];
  responseType: ResponseType;
  questions: FormQuestion[];
  dueDate: string;
  reminder: ReminderConfig;
  event?: PGEvent;
  venue?: string;
}

// Wraps plain text in a minimal valid Tiptap doc shape. Duplicated from
// `CreatePostView.tsx` so the mapper can produce a valid `richTextContent`
// without importing from the container layer.
function textToTiptapDoc(text: string): Record<string, unknown> {
  return {
    type: 'doc',
    content: text
      ? text.split('\n').map((line) => ({
          type: 'paragraph',
          content: line ? [{ type: 'text', text: line }] : [],
        }))
      : [{ type: 'paragraph' }],
  };
}

function groupRecipients(
  recipients: BuildPostPayloadInput['selectedRecipients'],
): PGApiCreateAnnouncementPayload['recipients'] {
  const out = {
    classIds: [] as number[],
    customGroupIds: [] as number[],
    ccaIds: [] as number[],
    levelIds: [] as number[],
  };
  for (const r of recipients) {
    const id = Number(r.id);
    if (Number.isNaN(id)) continue;
    switch (r.groupType) {
      case 'class':
        out.classIds.push(id);
        break;
      case 'custom':
        out.customGroupIds.push(id);
        break;
      case 'cca':
        out.ccaIds.push(id);
        break;
      case 'level':
        out.levelIds.push(id);
        break;
    }
  }
  return out;
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

function buildAnnouncementPayload(state: BuildPostPayloadInput): PGApiCreateAnnouncementPayload {
  const doc = state.descriptionDoc ?? textToTiptapDoc(state.description);
  return {
    title: state.title,
    richTextContent: JSON.stringify(doc),
    enquiryEmailAddress: state.enquiryEmail,
    recipients: groupRecipients(state.selectedRecipients),
    staffOwnerIds: state.selectedStaff.map((s) => Number(s.id)),
  } satisfies PGApiCreateAnnouncementPayload;
}

function buildConsentFormPayload(state: BuildPostPayloadInput): PGApiCreateConsentFormPayload {
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
  const reminderDate =
    state.reminder.type === 'NONE' ? null : localDateToSgtIso(state.reminder.date);
  const eventStartDate = state.event ? localDateTimeToSgtIso(state.event.start) : null;
  const eventEndDate = state.event ? localDateTimeToSgtIso(state.event.end) : null;
  // Venue is tracked both on `state.venue` (independently editable) and as a
  // child of `state.event.venue` when PGEvent is populated. Prefer the
  // free-standing field so a user can type a venue before setting dates.
  const venue = state.venue?.trim() ? state.venue.trim() : (state.event?.venue ?? null);
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
  return {
    title: state.title,
    richTextContent: JSON.stringify(doc),
    enquiryEmailAddress: state.enquiryEmail,
    responseType,
    consentByDate: localDateToSgtIso(state.dueDate),
    addReminderType: state.reminder.type,
    reminderDate,
    eventStartDate,
    eventEndDate,
    venue,
    recipients: groupRecipients(state.selectedRecipients),
    staffOwnerIds: state.selectedStaff.map((s) => Number(s.id)),
    customQuestions,
  } satisfies PGApiCreateConsentFormPayload;
}

/**
 * Dispatcher: narrows on `state.kind` and returns the correct create payload
 * shape. Callers pair this with `createAnnouncement` (kind==='announcement')
 * or `createConsentForm` (kind==='form'); the draft/schedule variants layer
 * `scheduledSendAt` on top.
 */
export function buildPostPayload(
  state: BuildPostPayloadInput,
): PGApiCreateAnnouncementPayload | PGApiCreateConsentFormPayload {
  return state.kind === 'form' ? buildConsentFormPayload(state) : buildAnnouncementPayload(state);
}

export type { BuildPostPayloadInput };
