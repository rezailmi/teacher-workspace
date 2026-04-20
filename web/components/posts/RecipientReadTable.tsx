import { Check, Clock, X } from 'lucide-react';

import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui';
import type {
  PGConsentFormRecipient,
  PGRecipient,
  ResponseType,
} from '~/data/mock-pg-announcements';
import { formatDate } from '~/helpers/dateTime';

type RecipientReadTableProps =
  | {
      kind?: 'announcement';
      recipients: PGRecipient[];
      responseType: ResponseType;
    }
  | {
      kind: 'form';
      recipients: PGConsentFormRecipient[];
      responseType: 'acknowledge' | 'yes-no';
    };

function Toolbar({ count }: { count: number }) {
  return <p className="text-sm text-muted-foreground">{count} recipients</p>;
}

function AnnouncementTable({
  recipients,
  responseType,
}: {
  recipients: PGRecipient[];
  responseType: ResponseType;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Student</TableHead>
          <TableHead>Class</TableHead>
          <TableHead>Read Status</TableHead>
          <TableHead>Read At</TableHead>
          {responseType === 'acknowledge' && (
            <>
              <TableHead>Acknowledged</TableHead>
              <TableHead>Acknowledged At</TableHead>
            </>
          )}
          {responseType === 'yes-no' && (
            <>
              <TableHead>Response</TableHead>
              <TableHead>Responded At</TableHead>
            </>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {recipients.map((recipient) => (
          <TableRow key={recipient.studentId}>
            <TableCell className="font-medium">{recipient.studentName}</TableCell>
            <TableCell className="text-muted-foreground">{recipient.classLabel}</TableCell>
            <TableCell>
              {recipient.readStatus === 'read' ? (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success-foreground">
                  <Check className="h-4 w-4" strokeWidth={2.25} />
                  Read
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-warning-foreground">
                  <Clock className="h-4 w-4" strokeWidth={2.25} />
                  Unread
                </span>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {recipient.readStatus === 'read' ? formatDate(recipient.respondedAt) : '\u2014'}
            </TableCell>
            {responseType === 'acknowledge' && (
              <>
                <TableCell>
                  {recipient.acknowledgedAt ? (
                    <Check className="h-4 w-4 text-success-foreground" />
                  ) : (
                    <X className="h-4 w-4 text-destructive" />
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(recipient.acknowledgedAt)}
                </TableCell>
              </>
            )}
            {responseType === 'yes-no' && (
              <>
                <TableCell>
                  {recipient.formResponse === 'yes' ? (
                    <Badge variant="success">Yes</Badge>
                  ) : recipient.formResponse === 'no' ? (
                    <Badge variant="destructive">No</Badge>
                  ) : (
                    <span className="text-muted-foreground">{'\u2014'}</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(recipient.respondedAt)}
                </TableCell>
              </>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ConsentFormTable({
  recipients,
  responseType,
}: {
  recipients: PGConsentFormRecipient[];
  responseType: 'acknowledge' | 'yes-no';
}) {
  const responseLabel = responseType === 'acknowledge' ? 'Acknowledged' : 'Response';

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Student</TableHead>
          <TableHead>Class</TableHead>
          <TableHead>{responseLabel}</TableHead>
          <TableHead>Responded At</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {recipients.map((recipient) => (
          <TableRow key={recipient.studentId}>
            <TableCell className="font-medium">{recipient.studentName}</TableCell>
            <TableCell className="text-muted-foreground">{recipient.classLabel}</TableCell>
            <TableCell>
              {recipient.response === 'YES' ? (
                <Badge variant="success">{responseType === 'acknowledge' ? 'Yes' : 'Yes'}</Badge>
              ) : recipient.response === 'NO' ? (
                <Badge variant="destructive">No</Badge>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                  <Clock className="h-4 w-4" strokeWidth={2.25} />
                  Pending
                </span>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {recipient.respondedAt ? formatDate(recipient.respondedAt) : '\u2014'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function RecipientReadTable(props: RecipientReadTableProps) {
  return (
    <div className="space-y-4">
      <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
        {props.kind === 'form' ? 'Consent form responses' : 'Recipient read status'}
      </p>

      <Toolbar count={props.recipients.length} />

      <div className="overflow-x-auto rounded-xl border">
        {props.kind === 'form' ? (
          <ConsentFormTable recipients={props.recipients} responseType={props.responseType} />
        ) : (
          <AnnouncementTable recipients={props.recipients} responseType={props.responseType} />
        )}
      </div>
    </div>
  );
}
