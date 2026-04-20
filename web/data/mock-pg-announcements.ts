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

export type FormQuestionType = 'free-text' | 'mcq';

export type FormQuestion =
  | { id: string; text: string; type: 'free-text' }
  | { id: string; text: string; type: 'mcq'; options: [string, ...string[]] };

export interface PGRecipient {
  studentId: string;
  studentName: string;
  classId: string;
  parentName: string;
  readStatus: 'read' | 'unread';
  respondedAt?: string;
  formResponse?: 'yes' | 'no';
  classLabel: string;
  indexNo: string;
  parentRelationship: string;
  pgStatus: 'onboarded' | 'not_onboarded';
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

export interface PGAnnouncement {
  id: string;
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
  questions?: FormQuestion[];
  dueDate?: string;
}
