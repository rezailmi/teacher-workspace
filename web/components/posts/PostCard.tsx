import { Bell, CalendarClock, CalendarDays, HelpCircle, MapPin, Paperclip } from 'lucide-react';

import { Card, CardContent, Separator } from '~/components/ui';
import type { PGPost, ReminderConfig } from '~/data/mock-pg-announcements';
import { formatDate, formatDateTime } from '~/helpers/dateTime';

interface Attachment {
  name: string;
  sizeKb: number;
}

interface PostCardProps {
  post: PGPost;
  /** Optional attachments — not yet carried by `PGPost`; wired from callers as needed. */
  attachments?: Attachment[];
  className?: string;
}

function formatSize(sizeKb: number) {
  if (sizeKb >= 1024) {
    return `${(sizeKb / 1024).toFixed(1)} MB`;
  }
  return `${sizeKb} KB`;
}

function reminderSummary(reminder: ReminderConfig): string | null {
  if (reminder.type === 'NONE') return null;
  const when = formatDate(reminder.date);
  return reminder.type === 'ONE_TIME'
    ? `One-time reminder on ${when}`
    : `Daily reminders from ${when}`;
}

/**
 * Right-rail summary card on the post detail view. Narrows on `post.kind` to
 * render announcement- vs consent-form-specific metadata inline; the prop
 * surface stays `{ post }` so form-only fields don't leak onto the shared API.
 */
export function PostCard({ post, attachments, className }: PostCardProps) {
  const isForm = post.kind === 'form';
  const kindLabel = isForm ? 'Consent form' : 'Announcement';

  // `event.start` / `event.end` arrive as SGT-anchored ISO-8601 from the detail
  // mapper (see `mapConsentFormDetail`), so `formatDateTime` renders them in
  // the teacher's intended timezone without a conversion round-trip.
  const eventStart = isForm && post.event ? formatDateTime(post.event.start) : undefined;
  const eventEnd = isForm && post.event ? formatDateTime(post.event.end) : undefined;
  const venue = isForm ? post.event?.venue : undefined;
  const dueDate = isForm ? formatDate(post.consentByDate) : undefined;
  const reminder = isForm ? reminderSummary(post.reminder) : null;
  const questions = isForm ? post.questions : undefined;

  return (
    <Card className={className}>
      <CardContent className="space-y-4 p-5">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          {kindLabel}
        </p>

        <div className="space-y-3">
          <h3 className="text-base leading-snug font-semibold">{post.title}</h3>
          <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
            {post.description}
          </p>
        </div>

        {isForm && (eventStart || venue || dueDate || reminder) && (
          <>
            <Separator />
            <div className="space-y-2.5">
              {eventStart && (
                <div className="flex items-start gap-2 text-sm">
                  <CalendarClock
                    className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                    strokeWidth={2}
                  />
                  <span>
                    {eventStart}
                    {eventEnd ? ` \u2013 ${eventEnd}` : ''}
                  </span>
                </div>
              )}
              {venue && (
                <div className="flex items-start gap-2 text-sm">
                  <MapPin
                    className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                    strokeWidth={2}
                  />
                  <span>{venue}</span>
                </div>
              )}
              {dueDate && (
                <div className="flex items-start gap-2 text-sm">
                  <CalendarDays
                    className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                    strokeWidth={2}
                  />
                  <span>Respond by {dueDate}</span>
                </div>
              )}
              {reminder && (
                <div className="flex items-start gap-2 text-sm">
                  <Bell className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                  <span>{reminder}</span>
                </div>
              )}
            </div>
          </>
        )}

        {isForm && questions && questions.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium">Questions</p>
              <ul className="space-y-1.5">
                {questions.map((q, i) => (
                  <li key={q.id} className="flex items-start gap-2 text-sm">
                    <HelpCircle
                      className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                      strokeWidth={2}
                    />
                    <span className="flex-1">
                      {i + 1}. {q.text}
                      {q.type === 'mcq' && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          (Multiple choice)
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {attachments && attachments.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium">Attachments</p>
              <ul className="space-y-1.5">
                {attachments.map((att) => (
                  <li key={att.name} className="flex items-center gap-2 text-sm">
                    <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{att.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {formatSize(att.sizeKb)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {post.enquiryEmail && (
          <>
            <Separator />
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Enquiry contact</p>
              <p className="text-sm font-medium">{post.enquiryEmail}</p>
            </div>
          </>
        )}

        {post.staffInCharge && (
          <>
            <Separator />
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Staff in charge</p>
              <p className="text-sm font-medium">{post.staffInCharge}</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
