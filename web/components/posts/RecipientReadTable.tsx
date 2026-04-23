import { Check, Clock, X } from 'lucide-react';
import { useMemo, useState } from 'react';

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

import {
  countActiveFilters,
  DEFAULT_RECIPIENT_FILTER,
  RecipientFilterPopover,
  type RecipientFilterValue,
} from './RecipientFilterPopover';

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

function Toolbar({
  count,
  total,
  filter,
  onFilterChange,
  classOptions,
  showReadStatus,
  showPgStatus,
}: {
  count: number;
  total: number;
  filter: RecipientFilterValue;
  onFilterChange: (next: RecipientFilterValue) => void;
  classOptions: string[];
  showReadStatus: boolean;
  showPgStatus: boolean;
}) {
  const active = countActiveFilters(filter);
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">
        {active > 0 ? `${count} of ${total} recipients` : `${total} recipients`}
      </p>
      <RecipientFilterPopover
        value={filter}
        onChange={onFilterChange}
        classOptions={classOptions}
        showReadStatus={showReadStatus}
        showPgStatus={showPgStatus}
        activeCount={active}
      />
    </div>
  );
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
                <Badge variant="success">
                  <Check />
                  Read
                </Badge>
              ) : (
                <Badge variant="warning">
                  <Clock />
                  Unread
                </Badge>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {recipient.readStatus === 'read' ? formatDate(recipient.respondedAt) : '\u2014'}
            </TableCell>
            {responseType === 'acknowledge' && (
              <>
                <TableCell>
                  {recipient.acknowledgedAt ? (
                    <Badge variant="success">
                      <Check />
                      Yes
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <X />
                      No
                    </Badge>
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
                <Badge variant="success">
                  <Check />
                  Yes
                </Badge>
              ) : recipient.response === 'NO' ? (
                <Badge variant="destructive">
                  <X />
                  No
                </Badge>
              ) : (
                <Badge variant="warning">
                  <Clock />
                  Pending
                </Badge>
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
  const [filter, setFilter] = useState<RecipientFilterValue>(DEFAULT_RECIPIENT_FILTER);
  const isForm = props.kind === 'form';

  const classOptions = useMemo(
    () => Array.from(new Set(props.recipients.map((r) => r.classLabel))).sort(),
    [props.recipients],
  );

  const filteredRecipients = useMemo(() => {
    return props.recipients.filter((r) => {
      if (filter.classId !== 'all' && r.classLabel !== filter.classId) return false;
      if (isForm) {
        if (filter.pg !== 'all' && (r as PGConsentFormRecipient).pgStatus !== filter.pg)
          return false;
      } else {
        if (filter.read !== 'all' && (r as PGRecipient).readStatus !== filter.read) return false;
      }
      return true;
    });
  }, [props.recipients, filter, isForm]);

  const tableProps = isForm
    ? {
        kind: 'form' as const,
        recipients: filteredRecipients as PGConsentFormRecipient[],
        responseType: props.responseType,
      }
    : {
        kind: 'announcement' as const,
        recipients: filteredRecipients as PGRecipient[],
        responseType: props.responseType,
      };

  return (
    <div className="space-y-4">
      <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
        {isForm ? 'Consent form responses' : 'Recipient read status'}
      </p>

      <Toolbar
        count={filteredRecipients.length}
        total={props.recipients.length}
        filter={filter}
        onFilterChange={setFilter}
        classOptions={classOptions}
        showReadStatus={!isForm}
        showPgStatus={isForm}
      />

      <div className="overflow-x-auto rounded-xl border">
        {filteredRecipients.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-muted-foreground">
            No recipients match these filters.
          </p>
        ) : tableProps.kind === 'form' ? (
          <ConsentFormTable
            recipients={tableProps.recipients}
            responseType={tableProps.responseType}
          />
        ) : (
          <AnnouncementTable
            recipients={tableProps.recipients}
            responseType={tableProps.responseType}
          />
        )}
      </div>
    </div>
  );
}
