/** Types matching the actual PG API response shapes from the Go BFF. */

// ─── Shared sub-shapes ──────────────────────────────────────────────────────

export type PGApiAnnouncementStatus = 'POSTED' | 'SCHEDULED' | 'DRAFT' | 'POSTING';
export type PGApiConsentFormStatus = 'OPEN' | 'CLOSED' | 'DRAFT' | 'POSTING' | 'SCHEDULED';
export type PGApiResponseType = 'VIEW_ONLY' | 'ACKNOWLEDGE' | 'YES_NO';

export interface PGApiStaffOwner {
  staffID: number;
  staffName: string;
}

export interface PGApiAnnouncementStudent {
  studentId: number;
  studentName: string;
  className: string;
  /** Older pgw-web shape (boolean). */
  isRead?: boolean;
  /** Current pgw-web shape — `'READ' | null` on each recipient. */
  readStatus?: 'READ' | null;
}

/**
 * Shape of a recipient entry under `consentFormRecipients[]` on the
 * consent-form detail response. Student identity lives on a nested `student`
 * object; reply + respond timestamp live at the recipient root.
 */
export interface PGApiConsentFormStudent {
  studentId: number;
  reply: 'YES' | 'NO' | null;
  replyDate: string | null;
  replyByParent: string | null;
  remarks: string | null;
  isIndividual: boolean;
  onBoardedCategory?: string;
  student: {
    studentId: number;
    studentName: string;
    indexNumber?: string;
    className: string;
    studentSex?: string;
  };
}

export interface PGApiImage {
  imageId: number;
  isCover: boolean;
  name: string;
  size: number;
  thumbnailUrl: string;
  url: string;
}

export interface PGApiAttachment {
  attachmentId: number;
  name: string;
  size: number;
  url: string;
}

export interface PGApiWebsiteLink {
  title: string;
  url: string;
}

export interface PGApiShortcutLink {
  shortcutLinkId: number;
  title: string;
  url: string;
}

export interface PGApiAnnouncementTarget {
  announcementId: number;
  announcementTargetId: number;
  createdAt: string;
  isDeleted: boolean;
  targetAcadYear: number;
  targetId: number;
  targetName: string;
  targetSchool: string;
  targetType: string;
  updatedAt: string;
}

export interface PGApiCustomQuestion {
  questionId: number;
  type: 'FREE_TEXT' | 'MCQ';
  text: string;
  options?: string[];
}

export interface PGApiConsentFormHistoryEntry {
  historyId: number;
  action: string;
  actionAt: string;
  actionBy: string;
}

// ─── Announcements ──────────────────────────────────────────────────────────

export type PGApiAnnouncementList = PGApiAnnouncementSummary[];

export interface PGApiAnnouncementSummary {
  id: string;
  postId: number;
  title: string;
  date: string;
  status: PGApiAnnouncementStatus;
  responseType?: PGApiResponseType;
  toParentsOf: string[];
  readMetrics?: { readPerStudent: number; totalStudents: number };
  scheduledSendFailureCode: string | null;
  createdByName: string;
}

/**
 * Shape of `GET /announcements/:id` as returned by pgw-web (verified by curl
 * 2026-04-23). Several fields our older code assumed were always present are
 * actually optional/nullable on the wire:
 * - `status`, `responseType`, `scheduledSendAt` → null for posted rows
 * - Web links live on `webLinkList`; `websiteLinks` is the (absent) older name
 * - `target` / `staffOwners` / `students` may be absent on minimal responses
 */
export interface PGApiAnnouncementDetail {
  announcementId: number;
  title: string;
  content: string | null;
  richTextContent: Record<string, unknown> | string | null;
  responseType?: PGApiResponseType | null;
  staffName: string;
  createdBy: number;
  createdAt: string | null;
  postedDate: string | null;
  enquiryEmailAddress: string;
  /** PG omits these on posts with no uploads; the mapper defaults to `[]`. */
  attachments?: PGApiAttachment[];
  images?: PGApiImage[];
  shortcutLink: PGApiShortcutLink[];
  /** pgw-web's current field name. Mapper also accepts the legacy `websiteLinks`. */
  webLinkList?: PGApiWebsiteLink[];
  websiteLinks?: PGApiWebsiteLink[];
  target?: PGApiAnnouncementTarget[];
  staffOwners?: PGApiStaffOwner[];
  students?: PGApiAnnouncementStudent[];
  status?: PGApiAnnouncementStatus | null;
  scheduledSendAt?: string | null;
  scheduledSendFailureCode?: string | null;
}

export interface PGApiAnnouncementDraft {
  announcementDraftId: number;
  status: 'DRAFT';
  postedAnnouncementId: number | null;
  title: string;
  content: string | null;
  richTextContent: string | null;
  enquiryEmailAddress: string;
  staffGroups: unknown[];
  studentGroups: unknown[];
  images: { images: unknown[]; imagesOrigin: string };
  attachments: unknown[];
  urls: unknown[];
  shortcuts: unknown[];
  updatedAt: string;
  scheduledDateTime: string | null;
}

export interface PGApiConsentFormDraft {
  consentFormDraftId: number;
  status: 'DRAFT';
  postedConsentFormId: number | null;
  title: string;
  content: string | null;
  richTextContent: string | null;
  venue: string;
  eventStartDate: { date: string; time: string } | null;
  eventEndDate: { date: string; time: string } | null;
  reminderDate: string;
  addReminderType: 'NONE' | 'ONE_TIME' | 'DAILY' | '';
  enquiryEmailAddress: string;
  consentByDate: string | null;
  responseType: 'ACKNOWLEDGEMENT' | 'YES_NO' | '';
  questions: unknown[];
  staffGroups: unknown[];
  studentGroups: unknown[];
  images: { images: unknown[]; imagesOrigin: string };
  attachments: unknown[];
  urls: unknown[];
  shortcuts: unknown[];
  updatedAt: string;
  scheduledDateTime: string | null;
}

// ─── Announcement write payloads ────────────────────────────────────────────

export interface PGApiCreateAnnouncementPayload {
  title: string;
  richTextContent: string;
  enquiryEmailAddress?: string;
  recipients: {
    classIds: number[];
    customGroupIds: number[];
    ccaIds: number[];
    levelIds: number[];
  };
  staffOwnerIds?: number[];
  /**
   * Write-side shortcut keys. PG accepts a plain string array of enum keys
   * (`"TRAVEL_DECLARATION" | "EDIT_CONTACT_DETAILS"`, see
   * `PG-API-CONTRACT.md:192/218`), distinct from the richer
   * `PGApiShortcutLink[]` that detail responses carry.
   */
  shortcutLink?: string[];
  websiteLinks?: PGApiWebsiteLink[];
  attachments?: PGApiAttachment[];
  images?: PGApiImage[];
}

export interface PGApiCreateDraftPayload extends PGApiCreateAnnouncementPayload {
  scheduledSendAt?: string | null;
}

export interface PGApiScheduleDraftPayload {
  announcementDraftId: number;
  scheduledSendAt: string;
}

/**
 * PGW returns the same envelope shape for all four duplicate endpoints
 * (`/announcements/duplicate`, `/announcements/drafts/duplicate`,
 * `/consentForms/duplicate`, `/consentForms/drafts/duplicate`): the new draft's
 * id and an `updatedAt` timestamp. Field name varies by post kind.
 */
export interface PGApiDuplicateAnnouncementResponse {
  announcementDraftId: number;
  updatedAt: string;
}

export interface PGApiDuplicateConsentFormResponse {
  consentFormDraftId: number;
  updatedAt: string;
}

// ─── Consent Forms ──────────────────────────────────────────────────────────

export type PGApiConsentFormList = PGApiConsentFormSummary[];

export interface PGApiConsentFormSummary {
  id: string;
  postId: number;
  title: string;
  date: string;
  status: PGApiConsentFormStatus;
  toParentsOf: string[];
  respondedMetrics: { respondedPerStudent: number; totalStudents: number };
  scheduledSendFailureCode: string | null;
  createdByName: string;
  consentByDate: string | null;
  eventStartDate?: string | null;
  eventEndDate?: string | null;
  eventReminderDate?: string | null;
}

export type PGApiReminderType = 'NONE' | 'ONE_TIME' | 'DAILY';

/**
 * Shape of `GET /consentForms/:id` as returned by pgw-web (verified by curl
 * against local pgw-web 2026-04-22). pgw-web's own declared type in
 * `shared-api-types/consentForms/consentForm.ts` uses slightly different names
 * in places (singular vs plural) — trust the observed wire shape.
 */
export interface PGApiConsentFormDetail {
  consentFormId: number;
  title: string;
  content: string | null;
  richTextContent: Record<string, unknown> | string | null;
  responseType: PGApiResponseType;
  eventStartDate: string | null;
  eventEndDate: string | null;
  consentByDate: string | null;
  addReminderType: PGApiReminderType;
  reminderDate: string | null;
  postedDate: string | null;
  venue: string | null;
  enquiryEmailAddress: string;
  staffName: string;
  createdBy: number;
  createdAt: string | null;
  images: PGApiImage[];
  /**
   * File attachments on the consent-form detail. Marked optional because the
   * real PGW endpoint didn't expose this field until recently (tracked in the
   * plan under U6 + PG-team ask #2); mock fixtures already seed it. Callers
   * should default to `[]` before mapping.
   */
  attachments?: PGApiAttachment[];
  /** Web links field is named `webLinkList` on the detail endpoint (not `websiteLinks`). */
  webLinkList: PGApiWebsiteLink[];
  /** Present but structure differs from writes; kept as opaque `unknown[]`. */
  shortcutLinkList?: unknown[];
  /** `null` when no custom questions are set. */
  customQuestions: PGApiCustomQuestion[] | null;
  staffOwners: PGApiStaffOwner[];
  /** Recipient students — field name is plural `consentFormRecipients`. */
  consentFormRecipients: PGApiConsentFormStudent[];
  consentFormHistory: PGApiConsentFormHistoryEntry[];
  /** Target list — plural `targets` (pgw-web's own type uses singular `target`
   * but the wire shape is plural). */
  targets?: PGApiAnnouncementTarget[];
}

// ─── Consent form write payloads ────────────────────────────────────────────
// TW-internal input shape the form collects; the mapper renames into the wire
// DTO that pgw-web actually accepts (see `mappers.ts`).

export interface PGApiCreateConsentFormPayload {
  title: string;
  richTextContent: string;
  enquiryEmailAddress?: string;
  responseType: 'ACKNOWLEDGEMENT' | 'YES_NO';
  consentByDate: string;
  addReminderType: PGApiReminderType;
  reminderDate?: string | null;
  /** PGW expects `{ date: 'YYYY-MM-DD', time: 'HH:mm' }` or `null` — see
   *  `pgw-web/src/server/modules/consent-form/consent-form-draft.service.ts#L337`. */
  eventStartDate?: { date: string; time: string } | null;
  eventEndDate?: { date: string; time: string } | null;
  venue?: string | null;
  recipients: {
    classIds: number[];
    customGroupIds: number[];
    ccaIds: number[];
    levelIds: number[];
  };
  staffOwnerIds?: number[];
  customQuestions?: PGApiCustomQuestion[];
  /** See note on `PGApiCreateAnnouncementPayload.shortcutLink`. */
  shortcutLink?: string[];
  websiteLinks?: PGApiWebsiteLink[];
  attachments?: PGApiAttachment[];
  images?: PGApiImage[];
}

export interface PGApiCreateConsentFormDraftPayload extends PGApiCreateConsentFormPayload {
  scheduledSendAt?: string | null;
}

// ─── School Data (for selectors) ────────────────────────────────────────────

export interface PGApiSchoolStaff {
  staffId: number;
  name: string;
  email: string;
  className?: string | null;
}

export type PGApiSchoolStaffList = PGApiSchoolStaff[];

export interface PGApiSchoolClass {
  type: 'class';
  label: string;
  labelDescription: string;
  value: number;
  acadYear: string;
  schoolId: number;
}

export interface PGApiSchoolStudent {
  studentId: number;
  studentName: string;
  uinFinNo: string;
  classSerialNo: string;
  classCode: string;
  className: string;
  levelCode: string;
  levelDescription: string;
  cca: unknown[];
}

export interface PGApiGroupsAssignedClass {
  classId: number;
  className: string;
  level: string;
  year: number;
  role: string;
  studentCount: number;
}

export interface PGApiGroupsAssignedCcaGroup {
  ccaId: number;
  ccaDescription: string;
  studentCount: number;
}

export interface PGApiGroupsAssigned {
  classes: PGApiGroupsAssignedClass[];
  ccaGroups: PGApiGroupsAssignedCcaGroup[];
}

export interface PGApiCustomGroupSummary {
  customGroupId: number;
  name: string;
  studentCount: number;
  createdBy: number;
  createdByName: string;
  isShared: boolean;
  createdAt: string;
}

export interface PGApiCustomGroupsList {
  customGroups: PGApiCustomGroupSummary[];
}

export interface PGApiClassDetail {
  classId: number;
  className: string;
  level: string;
  year: number;
  students: {
    studentId: number;
    studentName: string;
    admissionNumber: string;
  }[];
  formTeachers?: PGApiStaffOwner[];
}

// ─── Session & Config ───────────────────────────────────────────────────────

export interface PGApiSession {
  staffId: number;
  staffName: string;
  isA: boolean;
  staffSchoolId: number;
  staffEmailAdd: string;
  is2FAAuthorized: boolean;
  schoolEmailAddress: string;
  schoolName: string;
  sessionTimeLeft: number;
  displayName: string;
  displayEmail: string;
  displayUpdatedBy: string;
  displayUpdatedAt: string;
  isAdminUpdated: boolean;
  isIhl: boolean;
  heyTaliaAccess: boolean;
}

export interface PGApiConfig {
  flags: Record<string, { enabled: boolean }>;
  configs: Record<string, unknown>;
}

// ─── User Account ───────────────────────────────────────────────────────────

export interface PGApiUserProfile {
  staffId: number;
  staffName: string;
  staffSchoolId: number;
  email: string;
  schoolEmail: string;
  schoolName: string;
  displayName: string;
  displayEmail: string;
}
