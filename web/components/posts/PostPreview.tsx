import { generateHTML } from '@tiptap/react';
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  ChevronLeft,
  ExternalLink,
  FileText,
  ImageIcon,
  MapPin,
  MoreHorizontal,
  User,
  Users,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';

import { Button } from '~/components/ui';
import type { PostFormState, UploadingFile } from '~/containers/CreatePostView';
import { formatFileSize } from '~/helpers/attachments';
import { formatDateTime, formatLocalDate, formatLocalDateTimeRange } from '~/helpers/dateTime';
import { createRichTextExtensions, extractTextFromTiptap } from '~/helpers/tiptap';

// Built once — `generateHTML` only reads the schema, so the extensions never
// need a maxLength here (CharacterCount has no effect on static rendering).
const RICH_TEXT_EXTENSIONS = createRichTextExtensions();

/** Display labels for PG's shortcut enum keys. Kept local to the preview so
 *  ShortcutsSection stays the source of truth for the authoring side. */
const SHORTCUT_LABEL: Record<string, string> = {
  TRAVEL_DECLARATION: 'Declare travels',
  EDIT_CONTACT_DETAILS: 'Edit contact details',
};

interface PostPreviewProps {
  formState: PostFormState;
  currentUserName?: string;
  defaultEnquiryEmail?: string;
}

const PostPreview = React.memo(function PostPreview({
  formState,
  currentUserName = 'Daniel Tan',
  defaultEnquiryEmail = 'enquiry@school.edu.sg',
}: PostPreviewProps) {
  const {
    kind,
    title,
    description,
    descriptionDoc,
    responseType,
    questions,
    enquiryEmail,
    selectedRecipients,
    selectedStaff,
    websiteLinks,
    shortcuts,
    attachments,
    photos,
  } = formState;
  // Freeze the preview timestamp to the moment the component mounts so
  // `React.memo` short-circuits re-renders when form state is unchanged.
  const timestamp = useMemo(() => formatDateTime(new Date().toISOString(), { case: 'upper' }), []);
  // Serialize the Tiptap doc to HTML once per doc change; the editor holds the
  // JSON, we just re-render it statically with the same schema.
  const descriptionHtml = useMemo(() => {
    if (!descriptionDoc) return '';
    if (!extractTextFromTiptap(descriptionDoc)) return '';
    return generateHTML(descriptionDoc as Parameters<typeof generateHTML>[0], RICH_TEXT_EXTENSIONS);
  }, [descriptionDoc]);
  const hasContent = Boolean(title || description);
  const dimmedWhenEmpty = hasContent ? 'text-foreground' : 'text-muted-foreground/60';
  const enquiryContact = enquiryEmail || defaultEnquiryEmail;

  const isForm = kind === 'form';
  const titlePlaceholder = isForm ? 'Consent form title' : 'Announcement title';
  const descriptionPlaceholder = isForm
    ? 'Your consent form details will appear here.'
    : 'Your announcement details will appear here.';

  const eventRange = isForm
    ? formatLocalDateTimeRange(formState.event?.start, formState.event?.end)
    : undefined;
  const venue = isForm ? formState.venue?.trim() || undefined : undefined;
  const dueDateLabel = isForm ? formatLocalDate(formState.dueDate) : undefined;

  // Recipient summary for the phone-frame slot. Each parent actually sees
  // their own child's name on PG; when no real child is known we show a
  // representative from the teacher's selection so the preview echoes the
  // configured audience. Empty selection keeps the muted placeholder.
  const recipientSummary = useMemo(
    () => summariseRecipients(selectedRecipients),
    [selectedRecipients],
  );

  const readyPhotos = useMemo(() => photos.filter((p) => p.status === 'ready'), [photos]);
  const coverPhoto = readyPhotos.find((p) => p.isCover) ?? readyPhotos[0];
  const otherPhotos = readyPhotos.filter((p) => p !== coverPhoto);
  const readyAttachments = useMemo(
    () => attachments.filter((a) => a.status === 'ready'),
    [attachments],
  );
  const validLinks = useMemo(
    () => websiteLinks.filter((l) => l.url.trim().length > 0 || l.title.trim().length > 0),
    [websiteLinks],
  );
  const enabledShortcuts = shortcuts.filter((key) => SHORTCUT_LABEL[key]);

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-3xl border-2 border-foreground bg-white">
        {/* Mobile chrome */}
        <div className="flex items-center justify-between px-4 py-3">
          <ChevronLeft className="h-4 w-4 text-foreground" strokeWidth={2} />
          <div className="flex items-center gap-3 text-foreground">
            <ArrowUp className="h-4 w-4" strokeWidth={2} />
            <ArrowDown className="h-4 w-4" strokeWidth={2} />
            <MoreHorizontal className="h-4 w-4" strokeWidth={2} />
          </div>
        </div>

        <div className="flex min-h-[340px] flex-col px-5 pb-5">
          <div className="space-y-1">
            <p className={`text-lg leading-tight font-semibold ${dimmedWhenEmpty}`}>
              {title || titlePlaceholder}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {timestamp} · {currentUserName.toUpperCase()}
            </p>
          </div>

          <div
            className={`mt-3 flex items-center gap-1.5 text-[11px] font-medium tracking-wider uppercase ${
              recipientSummary ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            <User className="h-3 w-3" strokeWidth={2.25} />
            {recipientSummary ?? 'STUDENT NAME'}
          </div>

          {/* Cover photo + gallery */}
          {coverPhoto && (
            <div className="mt-4 space-y-1.5">
              <PreviewPhoto photo={coverPhoto} large />
              {otherPhotos.length > 0 && (
                <div className="grid grid-cols-3 gap-1.5">
                  {otherPhotos.map((p) => (
                    <PreviewPhoto key={p.localId} photo={p} />
                  ))}
                </div>
              )}
            </div>
          )}

          {isForm && (eventRange || venue) && (
            <div className="mt-4 space-y-1.5 rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-foreground">
              {eventRange && (
                <div className="flex items-start gap-2">
                  <CalendarClock
                    className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                    strokeWidth={2}
                  />
                  <span>{eventRange}</span>
                </div>
              )}
              {venue && (
                <div className="flex items-start gap-2">
                  <MapPin
                    className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                    strokeWidth={2}
                  />
                  <span>{venue}</span>
                </div>
              )}
            </div>
          )}

          <div className="mt-5 space-y-2">
            <p className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
              Details
            </p>
            {descriptionHtml ? (
              <div
                className="rich-content"
                // `generateHTML` serializes a trusted Tiptap schema; Link is
                // constrained to http/https/mailto via createRichTextExtensions.
                dangerouslySetInnerHTML={{ __html: descriptionHtml }}
              />
            ) : description ? (
              <p className="text-sm whitespace-pre-wrap text-foreground">{description}</p>
            ) : (
              <p className="text-sm text-muted-foreground/60">{descriptionPlaceholder}</p>
            )}
          </div>

          {/* File attachments */}
          {readyAttachments.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
                Attachments
              </p>
              <ul className="space-y-1.5">
                {readyAttachments.map((f) => (
                  <li
                    key={f.localId}
                    className="flex items-center gap-2 rounded-lg border bg-muted/30 px-2.5 py-2 text-xs"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{f.name}</span>
                    <span className="shrink-0 text-muted-foreground">{formatFileSize(f.size)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Website links */}
          {validLinks.length > 0 && (
            <div className="mt-4 space-y-1.5">
              <p className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
                Links
              </p>
              <ul className="space-y-1">
                {validLinks.map((link, i) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <li key={i} className="flex items-center gap-2 text-xs">
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate text-primary">
                      {link.title.trim() || link.url.trim() || 'Untitled link'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {questions.length > 0 && (
            <div className="mt-5 space-y-3 border-t pt-4">
              <p className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
                Questions ({questions.length})
              </p>
              {questions.map((q, i) => (
                <div key={q.id} className="space-y-1">
                  <p className="text-sm font-medium">
                    {i + 1}. {q.text || 'Untitled question'}
                  </p>
                  {q.type === 'mcq' && (
                    <p className="text-xs text-muted-foreground">Multiple choice</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {isForm && dueDateLabel && (
            <p className="mt-4 text-[11px] font-medium text-muted-foreground">
              Respond by {dueDateLabel}
            </p>
          )}

          {/* Shortcut pills — parent-app action row */}
          {enabledShortcuts.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-1.5">
              {enabledShortcuts.map((key) => (
                <span
                  key={key}
                  className="inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium text-foreground"
                >
                  {SHORTCUT_LABEL[key]}
                </span>
              ))}
            </div>
          )}

          {responseType === 'acknowledge' && (
            <div className="mt-5">
              <Button variant="secondary" size="sm" className="w-full" disabled>
                Acknowledge
              </Button>
            </div>
          )}
          {responseType === 'yes-no' && (
            <div className="mt-5 flex gap-2">
              <Button variant="default" size="sm" className="flex-1" disabled>
                Yes
              </Button>
              <Button variant="secondary" size="sm" className="flex-1" disabled>
                No
              </Button>
            </div>
          )}

          <div className="mt-auto pt-8 text-center">
            <p className="text-[11px] text-muted-foreground italic">
              For enquiries on this post, please contact
            </p>
            <p className="text-[11px] text-muted-foreground italic">{enquiryContact}</p>
          </div>
        </div>
      </div>

      {/* Teacher-facing footer: staff-in-charge isn't shown in the parent app,
          but teachers need to verify their selection at a glance. */}
      {selectedStaff.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="flex flex-wrap gap-x-1.5">
            <span className="font-medium text-foreground">Staff in charge:</span>
            {selectedStaff.map((s, i) => (
              <span key={s.id}>
                {s.label}
                {i < selectedStaff.length - 1 ? ',' : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

function PreviewPhoto({ photo, large = false }: { photo: UploadingFile; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = photo.thumbnailUrl ?? photo.url;

  // Reset the failure flag when the image source changes — otherwise a row
  // that errored once, then later got a valid `thumbnailUrl` via an
  // `UPDATE_UPLOAD` patch, would stay stuck on the fallback icon.
  React.useEffect(() => {
    setFailed(false);
  }, [src]);

  if (failed || !src) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg bg-muted text-muted-foreground ${
          large ? 'aspect-video w-full' : 'aspect-square'
        }`}
      >
        <ImageIcon className="h-5 w-5" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={photo.name}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`rounded-lg object-cover ${large ? 'aspect-video w-full' : 'aspect-square w-full'}`}
    />
  );
}

/** Pick a single label to stand in for the per-parent child-name line.
 *  Prefers an individual-student selection; falls back to the first group's
 *  label. Returns null when nothing is selected so the placeholder shows. */
function summariseRecipients(recipients: PostFormState['selectedRecipients']): string | null {
  if (recipients.length === 0) return null;
  const individual = recipients.find((r) => r.type === 'individual');
  const primary = individual ?? recipients[0];
  const extra = recipients.length - 1;
  const base = primary.label.toUpperCase();
  return extra > 0 ? `${base} · +${extra} more` : base;
}

export { PostPreview };
export type { PostPreviewProps };
