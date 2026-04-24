import { ArrowLeft, Eye, EyeOff, Plus } from 'lucide-react';
import { useDeferredValue, useMemo, useReducer, useRef, useState } from 'react';
import type { LoaderFunctionArgs } from 'react-router';
import { Link, Navigate, useLoaderData, useNavigate, useParams } from 'react-router';

import {
  createAnnouncement,
  createConsentForm,
  createConsentFormDraft,
  createDraft,
  fetchCustomGroups,
  fetchGroupsAssigned,
  fetchSchoolClasses,
  fetchSchoolStaff,
  fetchSchoolStudents,
  fetchSession,
  getConfigs,
  loadAnnouncementDraftDetail,
  loadConsentFormDraftDetail,
  loadConsentPostDetail,
  loadPostDetail,
  updateConsentFormDraft,
  updateDraft,
} from '~/api/client';
import { PGError, PGValidationError } from '~/api/errors';
import { buildAnnouncementPayload, buildConsentFormPayload } from '~/api/mappers';
import type {
  PGApiConfig,
  PGApiCustomGroupSummary,
  PGApiGroupsAssigned,
  PGApiSchoolClass,
  PGApiSchoolStaff,
  PGApiSchoolStudent,
  PGApiSession,
} from '~/api/types';
import type { SelectedEntity } from '~/components/comms/entity-selector';
import { StaffSelector } from '~/components/comms/staff-selector';
import { StudentRecipientSelector } from '~/components/comms/student-recipient-selector';
import { AttachmentSection } from '~/components/posts/AttachmentSection';
import { DueDateSection } from '~/components/posts/DueDateSection';
import { EventScheduleSection } from '~/components/posts/EventScheduleSection';
import { PostPreview } from '~/components/posts/PostPreview';
import { PostTypePicker, type PostKind } from '~/components/posts/PostTypePicker';
import { MAX_QUESTIONS, QuestionBuilder } from '~/components/posts/QuestionBuilder';
import { ReminderSection } from '~/components/posts/ReminderSection';
import { ResponseTypeSelector } from '~/components/posts/ResponseTypeSelector';
import { RichTextEditor } from '~/components/posts/RichTextEditor';
import { SchedulePickerDialog, type ScheduleWindow } from '~/components/posts/SchedulePickerDialog';
import { SendConfirmationDialog } from '~/components/posts/SendConfirmationDialog';
import { ShortcutsSection } from '~/components/posts/ShortcutsSection';
import { SplitPostButton } from '~/components/posts/SplitPostButton';
import { VenueSection } from '~/components/posts/VenueSection';
import { MAX_WEBSITE_LINKS, WebsiteLinksSection } from '~/components/posts/WebsiteLinksSection';
import type { WebsiteLink } from '~/components/posts/WebsiteLinksSection';
import {
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui';
import {
  isAnnouncementDraftId,
  isConsentFormDraftId,
  isConsentFormId,
  validatePostRoute,
  type FormQuestion,
  type PGAnnouncementTarget,
  type PGEvent,
  type PGPost,
  type ReminderConfig,
  type ResponseType,
} from '~/data/mock-pg-announcements';
import { assertNever } from '~/helpers/assertNever';
import { textToTiptapDoc } from '~/helpers/tiptap';
import { useAutoSave, type AutoSaveStatus } from '~/hooks/useAutoSave';
import { useUnsavedChangesGuard } from '~/hooks/useUnsavedChangesGuard';
import { notify } from '~/lib/notify';
import { cn } from '~/lib/utils';
import { reportValidationError } from '~/lib/validation-errors';

import { hasPendingUploads, isCreatePostFormValid } from './createPostValidation';

// ─── Route loader ───────────────────────────────────────────────────────────

interface CreatePostLoaderData {
  detail: PGPost | null;
  classes: PGApiSchoolClass[];
  staff: PGApiSchoolStaff[];
  students: PGApiSchoolStudent[];
  session: PGApiSession;
  /** Source data for the Level + CCA tabs on the recipient selector. */
  groupsAssigned: PGApiGroupsAssigned;
  /** Source data for the Custom Groups tab on the recipient selector. */
  customGroups: PGApiCustomGroupSummary[];
  /**
   * PG feature-flag payload. Read via the module-scope cache in
   * `~/api/client` so repeated route entries cost one RTT per 15 min. Gates
   * schedule-send and per-shortcut UI; missing flags render as off.
   */
  configs: PGApiConfig;
}

/**
 * Resolve the edit-mode post by kind. The URL search param `?kind=form` is
 * the primary routing signal (set when the PostsView navigates to edit); the
 * fallback parses the raw `:id` segment — `cf_` prefix routes to the
 * consent-form loader, bare numerics route to the announcement loader. An
 * unparseable ID resolves to `null`, which `CreatePostViewInner` redirects to
 * `/posts` (see the `Navigate` guard below).
 */
async function loadPostByKind(rawId: string, kindParam: string | null): Promise<PGPost | null> {
  const parsed = validatePostRoute(rawId, kindParam);
  if (!parsed) return null;
  if (isConsentFormDraftId(parsed)) return loadConsentFormDraftDetail(parsed);
  if (isConsentFormId(parsed)) return loadConsentPostDetail(parsed);
  if (isAnnouncementDraftId(parsed)) return loadAnnouncementDraftDetail(parsed);
  return loadPostDetail(parsed);
}

export async function loader({
  params,
  request,
}: LoaderFunctionArgs): Promise<CreatePostLoaderData> {
  const url = new URL(request.url);
  const kindParam = url.searchParams.get('kind');
  const [detail, classes, staff, students, session, groupsAssigned, customGroupsList, configs] =
    await Promise.all([
      params.id ? loadPostByKind(params.id, kindParam) : Promise.resolve(null),
      fetchSchoolClasses(),
      fetchSchoolStaff(),
      fetchSchoolStudents(),
      fetchSession(),
      fetchGroupsAssigned(),
      fetchCustomGroups(),
      getConfigs(),
    ]);
  return {
    detail,
    classes,
    staff,
    students,
    session,
    groupsAssigned,
    customGroups: customGroupsList.customGroups,
    configs,
  };
}

/**
 * Narrow `configs.configs.schedule_window` into a `ScheduleWindow` the picker
 * can consume. Config is typed as `Record<string, unknown>` because PG keeps
 * the shape loose; anything unexpected falls back to the component default.
 */
function parseScheduleWindow(raw: unknown): ScheduleWindow | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const maybe = raw as { start?: unknown; end?: unknown };
  if (typeof maybe.start !== 'string' || typeof maybe.end !== 'string') return undefined;
  if (!/^\d{2}:\d{2}$/.test(maybe.start) || !/^\d{2}:\d{2}$/.test(maybe.end)) return undefined;
  return { start: maybe.start, end: maybe.end };
}

// ─── Form state types ────────────────────────────────────────────────────────

/**
 * In-flight state for a single uploaded attachment or photo. Same shape for
 * both — `kind` discriminates which reducer slot (and write-payload slot) it
 * belongs to. `localId` is a client UUID distinct from the server-issued
 * `attachmentId` so the React key is stable across the upload lifecycle.
 */
export interface UploadingFile {
  localId: string;
  kind: 'file' | 'photo';
  name: string;
  size: number;
  mimeType: string;
  status: 'uploading' | 'verifying' | 'ready' | 'error';
  /** Server-issued; set after preUploadValidation returns. */
  attachmentId?: number;
  /** Download URL PG resolves against; set after S3 POST completes. */
  url?: string;
  /** Photos only; used for row thumbnails once the photo is ready. */
  thumbnailUrl?: string;
  /** Photos only; exactly one entry carries `isCover: true` when photos is non-empty. */
  isCover?: boolean;
  /** Populated on status === 'error'. */
  error?: string;
}

interface PostFormState {
  /**
   * Discriminant mirrored from `PGPost.kind`. In create mode it tracks the
   * `PostTypePicker` choice (`'announcement'` for "Post", `'form'` for
   * "Post with Responses"). In edit mode it's seeded from the loader's
   * returned post. Routes the submit path at `handleSendConfirm` /
   * `handleScheduleConfirm`.
   */
  kind: 'announcement' | 'form';
  title: string;
  /** Plain-text derivation of `descriptionDoc`, kept for preview + counter. */
  description: string;
  /** Source-of-truth Tiptap JSON; stringified into the outbound payload. */
  descriptionDoc: Record<string, unknown> | null;
  selectedRecipients: SelectedEntity[];
  responseType: ResponseType;
  questions: FormQuestion[];

  selectedStaff: SelectedEntity[];
  enquiryEmail: string;
  dueDate: string;
  /**
   * Consent-form reminder schedule. Defaults to `{ type: 'NONE' }`; the
   * reducer preserves a previously-picked date on the union narrows
   * (ONE_TIME / DAILY) so a user toggling None ↔ One-time ↔ Daily doesn't
   * lose their date. Only routed outbound when `kind === 'form'`.
   */
  reminder: ReminderConfig;
  /** Event details (start/end/venue) on a consent form. */
  event?: PGEvent;
  /** Venue on a consent form. Kept as a separate field from `event.venue` so the user can type a venue before/without setting start/end. */
  venue?: string;
  /**
   * Website links PG surfaces under the post description (`webLinkList` on the
   * wire). Up to 3 rows. Available on both kinds — the outbound mapper
   * forwards this into the announcement + consent-form builders identically.
   */
  websiteLinks: WebsiteLink[];
  /**
   * Shortcut keys the teacher enabled (`TRAVEL_DECLARATION`,
   * `EDIT_CONTACT_DETAILS`). Per-shortcut PG feature flags gate the UI; the
   * state only carries enabled keys, so a flipped-off flag can't leak a
   * stale value into the write.
   */
  shortcuts: string[];
  /**
   * File attachments (PDF/Office docs) — max 3. Carries rows in all lifecycle
   * states (`uploading` / `verifying` / `ready` / `error`); the submit mapper
   * filters to `ready` before writing to PG.
   */
  attachments: UploadingFile[];
  /**
   * Photo attachments — max 3, exactly one flagged `isCover: true` when the
   * list is non-empty (reducer invariant).
   */
  photos: UploadingFile[];
}

type PostFormAction =
  | { type: 'SET_KIND'; payload: 'announcement' | 'form' }
  | { type: 'SET_TITLE'; payload: string }
  | { type: 'SET_DESCRIPTION_DOC'; payload: { doc: Record<string, unknown>; text: string } }
  | { type: 'SET_RESPONSE_TYPE'; payload: ResponseType }
  | { type: 'SET_RECIPIENTS'; payload: SelectedEntity[] }
  | { type: 'ADD_QUESTION' }
  | { type: 'UPDATE_QUESTION'; id: string; payload: Partial<FormQuestion> }
  | { type: 'REMOVE_QUESTION'; id: string }
  | { type: 'MOVE_QUESTION'; id: string; direction: 'up' | 'down' }
  | { type: 'SET_STAFF'; payload: SelectedEntity[] }
  | { type: 'SET_EMAIL'; payload: string }
  | { type: 'SET_DUE_DATE'; payload: string }
  | { type: 'SET_REMINDER'; payload: ReminderConfig }
  | { type: 'SET_EVENT'; payload: PGEvent | undefined }
  | { type: 'SET_VENUE'; payload: string }
  | { type: 'ADD_WEBSITE_LINK' }
  | { type: 'REMOVE_WEBSITE_LINK'; index: number }
  | { type: 'UPDATE_WEBSITE_LINK'; index: number; field: 'url' | 'title'; value: string }
  | { type: 'SET_SHORTCUTS'; payload: string[] }
  | {
      type: 'ADD_UPLOAD';
      kind: 'file' | 'photo';
      payload: { localId: string; name: string; size: number; mimeType: string };
    }
  | {
      type: 'UPDATE_UPLOAD';
      kind: 'file' | 'photo';
      localId: string;
      patch: Partial<UploadingFile>;
    }
  | { type: 'REMOVE_UPLOAD'; kind: 'file' | 'photo'; localId: string }
  | { type: 'SET_COVER_PHOTO'; localId: string };

const INITIAL_STATE: PostFormState = {
  // Default matches the type-picker's default selection ("Post"). The picker
  // flips this to 'form' via handleTypeSelect when the user picks
  // "Post with Responses".
  kind: 'announcement',
  title: '',
  description: '',
  descriptionDoc: null,
  selectedRecipients: [],
  responseType: 'view-only',
  questions: [],

  selectedStaff: [],
  enquiryEmail: '',
  dueDate: '',
  reminder: { type: 'NONE' },
  event: undefined,
  venue: '',
  websiteLinks: [],
  shortcuts: [],
  attachments: [],
  photos: [],
};

function formReducer(state: PostFormState, action: PostFormAction): PostFormState {
  switch (action.type) {
    case 'SET_KIND':
      return { ...state, kind: action.payload };

    case 'SET_TITLE':
      return { ...state, title: action.payload };

    case 'SET_DESCRIPTION_DOC':
      return {
        ...state,
        descriptionDoc: action.payload.doc,
        description: action.payload.text,
      };

    case 'SET_RESPONSE_TYPE':
      return { ...state, responseType: action.payload };

    case 'SET_RECIPIENTS':
      return { ...state, selectedRecipients: action.payload };

    case 'ADD_QUESTION': {
      const newQuestion: FormQuestion = {
        id: crypto.randomUUID(),
        text: '',
        type: 'free-text',
      };
      return { ...state, questions: [...state.questions, newQuestion] };
    }

    case 'UPDATE_QUESTION': {
      return {
        ...state,
        questions: state.questions.map((q) => {
          if (q.id !== action.id) return q;
          const updated = { ...q, ...action.payload };
          if (action.payload.type === 'mcq' && q.type !== 'mcq') {
            return {
              id: q.id,
              text: updated.text,
              type: 'mcq' as const,
              options: (action.payload as { options?: [string, ...string[]] }).options ?? ['', ''],
            };
          }
          if (action.payload.type === 'free-text' && q.type !== 'free-text') {
            return {
              id: q.id,
              text: updated.text,
              type: 'free-text' as const,
            };
          }
          if (q.type === 'mcq') {
            return {
              ...q,
              ...action.payload,
              type: 'mcq' as const,
              options: (action.payload as { options?: [string, ...string[]] }).options ?? q.options,
            };
          }
          return { ...q, ...action.payload, type: 'free-text' as const };
        }),
      };
    }

    case 'REMOVE_QUESTION':
      return {
        ...state,
        questions: state.questions.filter((q) => q.id !== action.id),
      };

    case 'MOVE_QUESTION': {
      const idx = state.questions.findIndex((q) => q.id === action.id);
      if (idx === -1) return state;
      const newIdx = action.direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= state.questions.length) return state;
      const newQuestions = [...state.questions];
      [newQuestions[idx], newQuestions[newIdx]] = [newQuestions[newIdx], newQuestions[idx]];
      return { ...state, questions: newQuestions };
    }

    case 'SET_STAFF':
      return { ...state, selectedStaff: action.payload };

    case 'SET_EMAIL':
      return { ...state, enquiryEmail: action.payload };

    case 'SET_DUE_DATE':
      return { ...state, dueDate: action.payload };

    case 'SET_REMINDER':
      return { ...state, reminder: action.payload };

    case 'SET_EVENT':
      return { ...state, event: action.payload };

    case 'SET_VENUE':
      return { ...state, venue: action.payload };

    case 'ADD_WEBSITE_LINK': {
      // Enforce the 3-row cap at the reducer so any future caller (e.g. a
      // hydration path that tries to add a 4th) can't get the state into an
      // invalid shape. The UI also disables the button at the cap, but the
      // reducer is the single source of truth.
      if (state.websiteLinks.length >= MAX_WEBSITE_LINKS) return state;
      return { ...state, websiteLinks: [...state.websiteLinks, { url: '', title: '' }] };
    }

    case 'REMOVE_WEBSITE_LINK':
      return {
        ...state,
        websiteLinks: state.websiteLinks.filter((_, i) => i !== action.index),
      };

    case 'UPDATE_WEBSITE_LINK':
      return {
        ...state,
        websiteLinks: state.websiteLinks.map((link, i) =>
          i === action.index ? { ...link, [action.field]: action.value } : link,
        ),
      };

    case 'SET_SHORTCUTS':
      return { ...state, shortcuts: action.payload };

    case 'ADD_UPLOAD': {
      const slot: keyof Pick<PostFormState, 'attachments' | 'photos'> =
        action.kind === 'file' ? 'attachments' : 'photos';
      const list = state[slot];
      const entry: UploadingFile = {
        ...action.payload,
        kind: action.kind,
        status: 'uploading',
        // First photo added becomes the cover; subsequent photos default
        // to non-cover. File kind leaves `isCover` undefined.
        ...(action.kind === 'photo' ? { isCover: list.length === 0 } : {}),
      };
      return { ...state, [slot]: [...list, entry] };
    }

    case 'UPDATE_UPLOAD': {
      const slot: keyof Pick<PostFormState, 'attachments' | 'photos'> =
        action.kind === 'file' ? 'attachments' : 'photos';
      return {
        ...state,
        [slot]: state[slot].map((f) =>
          f.localId === action.localId ? { ...f, ...action.patch } : f,
        ),
      };
    }

    case 'REMOVE_UPLOAD': {
      const slot: keyof Pick<PostFormState, 'attachments' | 'photos'> =
        action.kind === 'file' ? 'attachments' : 'photos';
      const before = state[slot];
      const removed = before.find((f) => f.localId === action.localId);
      const next = before.filter((f) => f.localId !== action.localId);

      // Cover-photo invariant: if we just removed the covered photo and any
      // photos remain, promote the first remaining to cover so the submit
      // mapper never sees a coverless photo list.
      if (action.kind === 'photo' && removed?.isCover && next.length > 0) {
        const withCover = next.map((p, i) => ({ ...p, isCover: i === 0 }));
        return { ...state, photos: withCover };
      }
      return { ...state, [slot]: next };
    }

    case 'SET_COVER_PHOTO':
      return {
        ...state,
        photos: state.photos.map((p) => ({ ...p, isCover: p.localId === action.localId })),
      };

    default:
      return state;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// PG's lowercase targetType (`group`) maps to the FE EntitySelector's
// `groupType: 'custom'`; the others are 1:1. Mirror of `groupRecipients`.
const TARGET_TYPE_TO_GROUP_TYPE: Record<PGAnnouncementTarget['type'], SelectedEntity['groupType']> =
  {
    class: 'class',
    group: 'custom',
    cca: 'cca',
    level: 'level',
  };

// Class labels in /school/groups carry a year suffix (`P6 BEST (2026)`); student
// `className` drops it. Strip to match — same shape used in StudentRecipientSelector.
function stripClassYear(label: string): string {
  return label.replace(/ \(\d{4}\)$/, '');
}

function targetsToSelectedRecipients(
  targets: PGAnnouncementTarget[],
  classes: PGApiSchoolClass[],
  students: PGApiSchoolStudent[],
): SelectedEntity[] {
  // Build class-id → roster size lookup so class chips show real counts on
  // edit-mode hydration. Other target types (group/cca/level) don't yet have
  // roster data wired through the loader, so they fall back to 0.
  const classRosterById = new Map<number, number>();
  const studentsByClass = new Map<string, number>();
  for (const s of students) {
    studentsByClass.set(s.className, (studentsByClass.get(s.className) ?? 0) + 1);
  }
  for (const c of classes) {
    classRosterById.set(c.value, studentsByClass.get(stripClassYear(c.label)) ?? 0);
  }

  return targets.map((t) => ({
    id: t.id.toString(),
    label: t.label,
    type: 'group',
    count: t.type === 'class' ? (classRosterById.get(t.id) ?? 0) : 0,
    groupType: TARGET_TYPE_TO_GROUP_TYPE[t.type],
  }));
}

function ownerIdsToSelectedStaff(
  ownerIds: number[] | undefined,
  staff: PGApiSchoolStaff[],
  fallbackName: string | undefined,
): SelectedEntity[] {
  if (ownerIds && ownerIds.length > 0) {
    const byId = new Map(staff.map((s) => [s.staffId, s]));
    return ownerIds
      .map((id) => byId.get(id))
      .filter((s): s is PGApiSchoolStaff => s !== undefined)
      .map((s) => ({
        id: s.staffId.toString(),
        label: s.name,
        type: 'individual',
        count: 1,
      }));
  }
  // Fallback: detail response only carried `staffName`. Match by name so
  // legacy/summary-only payloads still hydrate the staff selector.
  const match = staff.find((s) => s.name === fallbackName);
  return match
    ? [{ id: match.staffId.toString(), label: match.name, type: 'individual', count: 1 }]
    : [];
}

/**
 * Convert a `PGConsentFormPost.event` (ISO timestamps from PG) back to the
 * `YYYY-MM-DDTHH:MM` naive-local shape `<input type="datetime-local">`
 * expects. PG's events are anchored in SGT so we render in that zone.
 */
function sgtIsoToLocalDateTime(iso: string): string {
  const d = new Date(iso);
  // `sv-SE` locale with `Asia/Singapore` TZ yields `YYYY-MM-DD HH:MM:SS`
  // in SGT; slice off the seconds and swap the space for `T` to match
  // the datetime-local format.
  const sgt = d.toLocaleString('sv-SE', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return sgt.replace(' ', 'T');
}

/**
 * Convert a `consentByDate` / `reminderDate` ISO timestamp back to the
 * bare `YYYY-MM-DD` shape `<input type="date">` expects, anchored in SGT.
 */
function sgtIsoToLocalDate(iso: string): string {
  const d = new Date(iso);
  // sv-SE formats dates as `YYYY-MM-DD` without locale prefixes.
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Singapore' });
}

function postToFormState(
  post: PGPost,
  staff: PGApiSchoolStaff[],
  classes: PGApiSchoolClass[],
  students: PGApiSchoolStudent[],
): PostFormState {
  const common = {
    title: post.title,
    description: post.description,
    // Prefer the raw Tiptap JSON when the detail response carried it;
    // fall back to a minimal doc wrapping the plain-text description so
    // edit mode always gets a valid initialContent for Tiptap.
    descriptionDoc: post.richTextContent ?? textToTiptapDoc(post.description),
    selectedRecipients: targetsToSelectedRecipients(post.targets ?? [], classes, students),
    selectedStaff: ownerIdsToSelectedStaff(post.staffOwnerIds, staff, post.staffInCharge),
    enquiryEmail: post.enquiryEmail ?? '',
    // Hydrate up to MAX_WEBSITE_LINKS to keep the edit-mode state shape
    // invariant with the create-mode cap. Extra rows (shouldn't happen —
    // PG enforces the cap on write) get silently truncated.
    websiteLinks: (post.websiteLinks ?? []).slice(0, MAX_WEBSITE_LINKS),
    // PG detail responses carry shortcuts as `PGApiShortcutLink[]` (detail
    // shape, not the write-side enum-key strings). Until Phase-1 splits the
    // read/write shapes formally, treat hydration as empty and rely on the
    // teacher re-toggling the checkbox. Safer than guessing a key from a
    // human-label `title`.
    shortcuts: [] as string[],
    // Rehydrate attachments + photos the mapper pulled off the detail
    // response. The `PGUploadedFile` shape is intentionally a subset of
    // `UploadingFile` with `status: 'ready'`, so a spread is wire-compatible.
    attachments: (post.attachments ?? []).map((f) => ({ ...f })) as UploadingFile[],
    photos: (post.photos ?? []).map((p) => ({ ...p })) as UploadingFile[],
  };

  switch (post.kind) {
    case 'form':
      return {
        ...common,
        kind: 'form',
        responseType: post.responseType,
        questions: post.questions,
        dueDate: post.consentByDate ? sgtIsoToLocalDate(post.consentByDate) : '',
        reminder:
          post.reminder.type === 'NONE'
            ? { type: 'NONE' }
            : { type: post.reminder.type, date: sgtIsoToLocalDate(post.reminder.date) },
        event: post.event
          ? {
              start: sgtIsoToLocalDateTime(post.event.start),
              end: sgtIsoToLocalDateTime(post.event.end),
              ...(post.event.venue && { venue: post.event.venue }),
            }
          : undefined,
        venue: post.event?.venue ?? '',
      };
    case 'announcement':
      return {
        ...common,
        kind: 'announcement',
        responseType: post.responseType,
        questions: post.questions ?? [],
        dueDate: post.dueDate ?? '',
        // Announcements don't carry reminder/event/venue.
        reminder: { type: 'NONE' },
        event: undefined,
        venue: '',
      };
    default:
      return assertNever(post);
  }
}

function editorHasContent(doc: PostFormState['descriptionDoc']): boolean {
  if (!doc || typeof doc !== 'object') return false;
  const content = (doc as { content?: unknown[] }).content;
  return Array.isArray(content) && content.length > 0;
}

// ─── Inner component ─────────────────────────────────────────────────────────

function CreatePostViewInner({ editId }: { editId?: string }) {
  const navigate = useNavigate();
  const { detail, classes, staff, students, session, groupsAssigned, customGroups, configs } =
    useLoaderData<CreatePostLoaderData>();
  // Gate the Schedule side of the split button on PG's flag. Missing flag ⇒
  // treat as off (silent fallback) so the UI never promises behaviour PG has
  // turned off for the school.
  const scheduleEnabled = configs.flags.schedule_announcement_form_post?.enabled === true;
  // Per-shortcut flag gates. `absence_submission` maps to the Declare-travels
  // shortcut per the plan; the Edit-contact shortcut has no documented flag
  // yet, so we treat it as always available until PG names one.
  const declareTravelsEnabled = configs.flags.absence_submission?.enabled === true;
  const editContactEnabled = true;
  // PG ask #4 is unresolved — is the 7:00–21:45 SGT window hard-coded upstream
  // or school-configurable. Sourcing through `configs.configs.schedule_window`
  // makes a later flip a config change, not a code change. Shape is validated
  // defensively; anything unexpected falls back to the component's default.
  const scheduleWindow = parseScheduleWindow(configs.configs.schedule_window);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  // Preview defaults to visible on desktop, hidden on mobile. Once the user
  // toggles it we stop tracking the viewport — the toggle is sticky so
  // resizing past the breakpoint doesn't clobber their choice.
  const [showPreview, setShowPreview] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(min-width: 1024px)').matches;
  });
  // `submitted` lives until the browser unmounts us on navigate — that's what
  // debounces a rapid double-tap on the Post button without a setTimeout race.
  const [saveState, setSaveState] = useState<'idle' | 'submitting' | 'submitted'>('idle');
  const isSaving = saveState !== 'idle';

  // Enquiry-email options derived from the logged-in staff profile.
  const emailOptions = useMemo(
    () =>
      [session.staffEmailAdd, session.schoolEmailAddress].filter((e): e is string => Boolean(e)),
    [session.staffEmailAdd, session.schoolEmailAddress],
  );

  // Type picker state — skip in edit mode, infer from loaded data
  const [selectedType, setSelectedType] = useState<PostKind | null>(() => {
    if (!editId) return null;
    // Consent-form kind always renders the response-variant flow; announcement
    // kind picks its flow from `responseType` (acknowledge/yes-no only apply
    // to legacy announcement variants that carried form-like behaviour).
    if (detail?.kind === 'form') return 'post-with-response';
    if (detail && (detail.responseType === 'acknowledge' || detail.responseType === 'yes-no')) {
      return 'post-with-response';
    }
    return 'post';
  });

  const editData = detail ? postToFormState(detail, staff, classes, students) : null;

  const [state, dispatch] = useReducer(formReducer, editData ?? INITIAL_STATE);

  // Captured once from the initial reducer state: `useEditor` only reads
  // `content` on mount, so later reducer updates to `descriptionDoc` must
  // come from the editor itself (via onChange), not be pushed back in.
  const initialDescriptionDocRef = useRef(state.descriptionDoc);
  const initialDescriptionDoc = initialDescriptionDocRef.current;

  const deferredState = useDeferredValue(state);
  // pgw rejects writes without an enquiry email, and the outbound mapper
  // throws on the same pre-check — gate the Post button here so the user
  // sees a disabled action instead of a cryptic failure toast after submit.
  //
  // Consent-form variant (post-with-response) additionally requires a due date
  // and a non-None reminder type. Phase 2 will flip routing to `/consentForms`
  // and these fields will be required by the wire contract; gate in advance so
  // the form-state matches what Phase 2 expects.
  const isFormValid = isCreatePostFormValid(state, selectedType);
  const uploadsPending = hasPendingUploads(state);
  const recipientCount = state.selectedRecipients.reduce((sum, r) => sum + (r.count ?? 1), 0);
  const isEditing = Boolean(editId);
  const draftIdRef = useRef<{ kind: 'announcement' | 'form'; id: number } | null>(
    editId?.startsWith('annDraft_')
      ? { kind: 'announcement', id: Number(editId.slice('annDraft_'.length)) }
      : editId?.startsWith('cfDraft_')
        ? { kind: 'form', id: Number(editId.slice('cfDraft_'.length)) }
        : editId?.startsWith('cf_')
          ? { kind: 'form', id: Number(editId.slice('cf_'.length)) }
          : null,
  );
  const autoSave = useAutoSave({
    payload: state,
    save: async (_snapshot, { signal }) => {
      // Re-use handleSaveDraft so URL navigation + error handling stay DRY.
      await handleSaveDraft({ signal });
    },
    intervalMs: 30_000,
    enabled: !isSaving, // pause autosave while publishing/scheduling
    shouldSave: (s) => s.title.trim().length > 0 || editorHasContent(s.descriptionDoc),
  });

  const isDirty =
    autoSave.lastSavedSerialized !== null
      ? JSON.stringify(state) !== autoSave.lastSavedSerialized
      : // No save has happened yet. Treat as dirty only if there's meaningful content.
        state.title.trim().length > 0 || editorHasContent(state.descriptionDoc);

  useUnsavedChangesGuard(isDirty);

  if (editId && !editData) {
    return <Navigate to="/posts" replace />;
  }

  function handleTypeSelect(type: PostKind) {
    setSelectedType(type);
    const kind: PostFormState['kind'] = type === 'post-with-response' ? 'form' : 'announcement';
    dispatch({ type: 'SET_KIND', payload: kind });
    if (type === 'post-with-response') {
      dispatch({ type: 'SET_RESPONSE_TYPE', payload: 'acknowledge' });
    }
  }

  async function handleSaveDraft(opts: { signal?: AbortSignal } = {}): Promise<void> {
    try {
      // Branch by kind: announcements and consent forms are separate PGW
      // endpoint families with non-overlapping field sets. Sending consent-form
      // fields (eventStartDate, venue, etc.) to /announcements/drafts produces
      // `"eventStartDate" is not allowed`. Routing here mirrors
      // `handleScheduleConfirm` / `handleSendConfirm`.
      if (state.kind === 'form') {
        const payload = buildConsentFormPayload(state);
        if (draftIdRef.current?.kind === 'form') {
          await updateConsentFormDraft(draftIdRef.current.id, payload, {
            signal: opts.signal,
          });
        } else {
          const { consentFormDraftId } = await createConsentFormDraft(payload, {
            signal: opts.signal,
          });
          draftIdRef.current = { kind: 'form', id: consentFormDraftId };
        }
      } else {
        const payload = buildAnnouncementPayload(state);
        if (draftIdRef.current?.kind === 'announcement') {
          await updateDraft(draftIdRef.current.id, payload, { signal: opts.signal });
        } else {
          const { announcementDraftId } = await createDraft(payload, { signal: opts.signal });
          draftIdRef.current = { kind: 'announcement', id: announcementDraftId };
        }
      }
      // Don't navigate: the draft-detail mapper doesn't yet re-hydrate
      // recipients/staff/attachments, so navigating would remount the form
      // into a partial state. `draftIdRef` keeps the id in-memory so
      // subsequent saves call the correct update endpoint. Trade-off: a
      // browser refresh loses the link to the in-flight draft (it's still
      // saved in PGW — the user can find it from `/posts` and click through).
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (err instanceof PGValidationError) {
        notify.error(reportValidationError(err));
      } else if (err instanceof Error && !(err instanceof PGError)) {
        // Plain `Error`s from the outbound mapper (e.g. payload-builder
        // guards) carry a useful message; surface it verbatim rather than a
        // generic toast.
        notify.error(err.message);
      } else if (!(err instanceof PGError)) {
        notify.error('Failed to save draft.');
      }
      throw err;
    }
  }

  async function handleScheduleConfirm(scheduledSendAt: string) {
    if (saveState !== 'idle') return;
    setShowScheduleDialog(false);
    setSaveState('submitting');
    try {
      if (state.kind === 'form') {
        // Consent-form draft create/update. The `cf_<digits>` brand carries
        // through from the loader; strip the prefix for the mutation URL.
        const draftPayload = { ...buildConsentFormPayload(state), scheduledSendAt };
        if (isEditing && editId?.startsWith('cf_')) {
          await updateConsentFormDraft(Number(editId.slice(3)), draftPayload);
        } else {
          await createConsentFormDraft(draftPayload);
        }
      } else {
        const draftPayload = { ...buildAnnouncementPayload(state), scheduledSendAt };
        if (draftIdRef.current?.kind === 'announcement') {
          // Editing an existing draft: keep the same draft, just push the new
          // `scheduledSendAt` with the other field updates.
          await updateDraft(draftIdRef.current.id, draftPayload);
        } else {
          // New post → schedule in a single round-trip. `scheduleDraft` (which
          // targets a pre-saved draft) is deferred; we don't need it for this
          // flow.
          await createDraft(draftPayload);
        }
      }
      setSaveState('submitted');
      notify.success('Post scheduled.');
      navigate('/posts');
    } catch (err) {
      setSaveState('idle');
      if (err instanceof PGValidationError) {
        notify.error(reportValidationError(err));
      } else if (!(err instanceof PGError)) {
        notify.error('Failed to schedule post. Please try again.');
      }
    }
  }

  async function handleSendConfirm() {
    if (saveState !== 'idle') return;
    setShowSendDialog(false);
    setSaveState('submitting');
    try {
      if (state.kind === 'form') {
        await createConsentForm(buildConsentFormPayload(state));
      } else {
        await createAnnouncement(buildAnnouncementPayload(state));
      }
      setSaveState('submitted');
      notify.success('Post sent.');
      navigate('/posts');
    } catch (err) {
      setSaveState('idle');
      if (err instanceof PGValidationError) {
        notify.error(reportValidationError(err));
      } else if (err instanceof Error && !(err instanceof PGError)) {
        // Plain `Error`s from the outbound mapper (e.g. missing email) carry
        // a useful message; surface it verbatim rather than a generic toast.
        notify.error(err.message);
      } else if (!(err instanceof PGError)) {
        notify.error('Failed to send post. Please try again.');
      }
    }
  }

  if (!selectedType) {
    return (
      <div className="flex flex-col">
        {/* Minimal header */}
        <div className="sticky top-0 z-10 border-b bg-white/95 px-6 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <Link to="/posts" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-xl font-semibold tracking-tight">New Post</h1>
          </div>
        </div>

        <PostTypePicker onSelect={handleTypeSelect} />
      </div>
    );
  }

  // ── Form view ──────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-white/95 px-6 py-3 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-4">
          {/* Left: back arrow + title */}
          <div className="flex items-center gap-3">
            <Link to="/posts" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-xl font-semibold tracking-tight">
              {isEditing ? 'Edit Post' : 'New Post'}
            </h1>
          </div>

          {/* Right: save-status + preview toggle + save draft + split button */}
          <div className="flex items-center gap-3">
            <SaveStatusTicker status={autoSave.status} lastSavedAt={autoSave.lastSavedAt} />
            <Button variant="ghost" size="sm" onClick={() => setShowPreview((s) => !s)}>
              {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={autoSave.status === 'saving'}
              onClick={() => {
                void autoSave.saveNow();
              }}
            >
              {autoSave.status === 'saving' ? 'Saving…' : 'Save draft'}
            </Button>
            {/* Schedule action is gated on PG's `schedule_announcement_form_post`
                flag. When disabled, `onSchedule` is left undefined so the
                dropdown's "Schedule for later" entry still renders but
                becomes a no-op — the consent-form path already round-trips
                via `POST /consentForms/drafts` with `scheduledSendAt` set
                (see `handleScheduleConfirm`). */}
            <SplitPostButton
              disabled={!isFormValid || isSaving}
              onPost={() => setShowSendDialog(true)}
              onSchedule={scheduleEnabled ? () => setShowScheduleDialog(true) : undefined}
            />
            {uploadsPending && (
              <span className="text-xs text-muted-foreground">Attachments uploading…</span>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex justify-center gap-8 px-6 py-6">
        {/* Form column */}
        <div className="w-full max-w-2xl flex-1 space-y-6">
          {/* RECIPIENTS Card */}
          <Card>
            <CardContent className="space-y-5 p-6">
              <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                Recipients
              </p>

              {/* Students field */}
              <div className="space-y-1.5">
                <Label>
                  Students <span className="text-destructive">*</span>
                </Label>
                <p className="text-sm text-muted-foreground">
                  Parents of the selected students will receive this post via Parents Gateway.
                </p>
                <StudentRecipientSelector
                  value={state.selectedRecipients}
                  onChange={(recipients) =>
                    dispatch({ type: 'SET_RECIPIENTS', payload: recipients })
                  }
                  classes={classes}
                  students={students}
                  groupsAssigned={groupsAssigned}
                  customGroups={customGroups}
                />
              </div>

              {/* Staff in charge */}
              <div className="space-y-1.5">
                <Label>Staff in charge</Label>
                <p className="text-sm text-muted-foreground">
                  These staff will be able to view read status, and delete the post.
                </p>
                <StaffSelector
                  value={state.selectedStaff}
                  onChange={(sel) => dispatch({ type: 'SET_STAFF', payload: sel })}
                  staff={staff}
                />
              </div>

              {/* Enquiry email */}
              <div className="space-y-1.5">
                <Label>
                  Enquiry email <span className="text-destructive">*</span>
                </Label>
                <p className="text-sm text-muted-foreground">
                  Select the preferred email address to receive enquiries from parents.
                </p>
                <Select
                  value={state.enquiryEmail ?? ''}
                  onValueChange={(value) =>
                    dispatch({ type: 'SET_EMAIL', payload: value as string })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select or add an email..." />
                  </SelectTrigger>
                  <SelectContent>
                    {emailOptions.map((email) => (
                      <SelectItem key={email} value={email}>
                        {email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* CONTENT Card */}
          <Card>
            <CardContent className="space-y-5 p-6">
              <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                Content
              </p>

              {/* Title with counter */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="post-title">
                    Title <span className="text-destructive">*</span>
                  </Label>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {state.title.length}/120
                  </span>
                </div>
                <Input
                  id="post-title"
                  placeholder="e.g. Term 3 School Camp Consent & Payment"
                  value={state.title}
                  maxLength={120}
                  onChange={(e) => dispatch({ type: 'SET_TITLE', payload: e.target.value })}
                />
              </div>

              {/* Description with counter and toolbar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label id="post-description-label">
                    Description <span className="text-destructive">*</span>
                  </Label>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {state.description.length}/2000
                  </span>
                </div>
                <RichTextEditor
                  initialContent={initialDescriptionDoc}
                  maxLength={2000}
                  placeholder="Write your announcement here. Use the toolbar to format text and insert inline links."
                  ariaLabelledBy="post-description-label"
                  onChange={(doc, text) =>
                    dispatch({
                      type: 'SET_DESCRIPTION_DOC',
                      payload: { doc, text },
                    })
                  }
                />
              </div>

              {/* Attachments */}
              <AttachmentSection
                files={state.attachments}
                photos={state.photos}
                dispatch={dispatch}
                kind={state.kind === 'announcement' ? 'ANNOUNCEMENT' : 'CONSENT_FORM'}
              />

              {/* Website links — available on both kinds. */}
              <WebsiteLinksSection value={state.websiteLinks} dispatch={dispatch} />

              {/* Shortcuts — per-key flag-gated. Renders null when both
                  shortcuts are gated off, so there's no empty subsection. */}
              <ShortcutsSection
                value={state.shortcuts}
                onChange={(next) => dispatch({ type: 'SET_SHORTCUTS', payload: next })}
                declareTravelsEnabled={declareTravelsEnabled}
                editContactEnabled={editContactEnabled}
              />
            </CardContent>
          </Card>

          {/* RESPONSE TYPE Card (only for post-with-response) */}
          {selectedType === 'post-with-response' && (
            <Card>
              <CardContent className="space-y-5 p-6">
                <div className="space-y-1">
                  <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                    Response Type
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Choose how parents respond to this post.
                  </p>
                </div>

                <ResponseTypeSelector
                  value={state.responseType}
                  onChange={(value) => dispatch({ type: 'SET_RESPONSE_TYPE', payload: value })}
                  hideViewOnly
                >
                  <div className="mt-6 space-y-6">
                    <DueDateSection
                      value={state.dueDate}
                      onChange={(value) => dispatch({ type: 'SET_DUE_DATE', payload: value })}
                      required
                    />

                    <ReminderSection
                      value={state.reminder}
                      onChange={(value) => dispatch({ type: 'SET_REMINDER', payload: value })}
                    />

                    <EventScheduleSection
                      value={state.event}
                      onChange={(value) => dispatch({ type: 'SET_EVENT', payload: value })}
                    />

                    <VenueSection
                      value={state.venue}
                      onChange={(value) => dispatch({ type: 'SET_VENUE', payload: value })}
                    />
                  </div>
                </ResponseTypeSelector>
              </CardContent>
            </Card>
          )}

          {/* QUESTIONS Card (only for post-with-response, after a response type is picked) */}
          {selectedType === 'post-with-response' &&
            (state.responseType === 'acknowledge' || state.responseType === 'yes-no') && (
              <Card>
                <CardContent className="space-y-5 p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                        Questions
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Custom questions (optional). You may add up to {MAX_QUESTIONS} questions.
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={state.questions.length >= MAX_QUESTIONS}
                      onClick={() => dispatch({ type: 'ADD_QUESTION' })}
                    >
                      <Plus className="h-4 w-4" />
                      Add a Question
                    </Button>
                  </div>

                  <QuestionBuilder questions={state.questions} dispatch={dispatch} />
                </CardContent>
              </Card>
            )}
        </div>

        {showPreview && (
          <div className="sticky top-[72px] hidden h-fit w-[360px] shrink-0 lg:block">
            <Card>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-base font-medium">Preview</p>
                  <p className="text-xs text-muted-foreground">As seen by parents</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  This is how parents will see your announcement on the Parents Gateway App.
                </p>
                <PostPreview
                  formState={deferredState}
                  currentUserName={session.staffName ?? 'Daniel Tan'}
                  defaultEnquiryEmail={session.schoolEmailAddress ?? 'enquiry@school.edu.sg'}
                />
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Mobile preview — kept mounted to avoid flicker on toggle */}
      <div
        className={cn(
          'fixed inset-0 z-50 transition-opacity duration-150 lg:hidden',
          showPreview ? 'pointer-events-auto bg-black/50' : 'pointer-events-none bg-transparent',
        )}
        onClick={() => setShowPreview(false)}
      >
        <div
          className={cn(
            'absolute top-0 right-0 bottom-0 w-[360px] overflow-y-auto bg-white p-4 shadow-xl transition-transform duration-150',
            showPreview ? 'translate-x-0' : 'translate-x-full',
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-medium">Preview</p>
            <Button variant="ghost" size="sm" onClick={() => setShowPreview(false)}>
              Close
            </Button>
          </div>
          <PostPreview
            formState={deferredState}
            currentUserName={session.staffName ?? 'Daniel Tan'}
            defaultEnquiryEmail={session.schoolEmailAddress ?? 'enquiry@school.edu.sg'}
          />
        </div>
      </div>

      {/* Send confirmation dialog */}
      <SendConfirmationDialog
        open={showSendDialog}
        onOpenChange={setShowSendDialog}
        title={state.title}
        recipientCount={recipientCount}
        responseType={state.responseType}
        onConfirm={handleSendConfirm}
      />

      {/* Schedule picker dialog */}
      <SchedulePickerDialog
        open={showScheduleDialog}
        onOpenChange={setShowScheduleDialog}
        onConfirm={handleScheduleConfirm}
        busy={isSaving}
        scheduleWindow={scheduleWindow}
      />
    </div>
  );
}

// ─── Route component ─────────────────────────────────────────────────────────

function CreatePostView() {
  const { id } = useParams();
  return <CreatePostViewInner key={id ?? 'new'} editId={id} />;
}

export { CreatePostView as Component };
export type { PostFormAction, PostFormState };
export { formReducer as __formReducer, INITIAL_STATE as __INITIAL_STATE };

// ─── SaveStatusTicker ────────────────────────────────────────────────────────

function SaveStatusTicker({
  status,
  lastSavedAt,
}: {
  status: AutoSaveStatus;
  lastSavedAt: Date | null;
}) {
  let label: string;
  if (status === 'saving') label = 'Saving…';
  else if (status === 'error') label = 'Save failed';
  else if (lastSavedAt) {
    label = `Saved ${lastSavedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  } else label = '';

  return (
    <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
      {label}
    </span>
  );
}
