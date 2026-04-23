import { Check, Clock, Download, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  Badge,
  Button,
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
import { downloadCsv, toCsv, type CsvColumn } from '~/helpers/exportCsv';

import {
  countActiveFilters,
  DEFAULT_RECIPIENT_FILTER,
  RecipientFilterPopover,
  type ColumnOption,
  type RecipientFilterValue,
} from './RecipientFilterPopover';

type FilterControlProps =
  | { filter: RecipientFilterValue; onFilterChange: (next: RecipientFilterValue) => void }
  | { filter?: undefined; onFilterChange?: undefined };

/**
 * `filter` / `onFilterChange` are optional — when both are passed the table
 * is controlled (so a parent like `PostDetailView` can wire stat cards to
 * the read filter). When absent, the table manages its own filter state.
 */
type RecipientReadTableProps = FilterControlProps &
  (
    | {
        kind?: 'announcement';
        recipients: PGRecipient[];
        responseType: ResponseType;
        /** Used in the default CSV filename so teachers can tell exports apart. */
        exportId?: string;
      }
    | {
        kind: 'form';
        recipients: PGConsentFormRecipient[];
        responseType: 'acknowledge' | 'yes-no';
        exportId?: string;
      }
  );

function Toolbar({
  count,
  total,
  filter,
  onFilterChange,
  classOptions,
  showReadStatus,
  showPgStatus,
  columnOptions,
  showDeferredNote,
  onExport,
}: {
  count: number;
  total: number;
  filter: RecipientFilterValue;
  onFilterChange: (next: RecipientFilterValue) => void;
  classOptions: string[];
  showReadStatus: boolean;
  showPgStatus: boolean;
  columnOptions: ColumnOption[];
  showDeferredNote: boolean;
  onExport: () => void;
}) {
  const active = countActiveFilters(filter);
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">
        {active > 0 ? `${count} of ${total} recipients` : `${total} recipients`}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={onExport} aria-label="Download CSV">
          <Download className="h-4 w-4" />
          Download
        </Button>
        <RecipientFilterPopover
          value={filter}
          onChange={onFilterChange}
          classOptions={classOptions}
          showReadStatus={showReadStatus}
          showPgStatus={showPgStatus}
          columnOptions={columnOptions}
          showDeferredNote={showDeferredNote}
          activeCount={active}
        />
      </div>
    </div>
  );
}

function AnnouncementTable({
  recipients,
  responseType,
  columns,
}: {
  recipients: PGRecipient[];
  responseType: ResponseType;
  columns: RecipientFilterValue['columns'];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Student</TableHead>
          <TableHead>Class</TableHead>
          {columns.readStatus && <TableHead>Read Status</TableHead>}
          {columns.readAt && <TableHead>Read At</TableHead>}
          {responseType === 'acknowledge' && (
            <>
              {columns.acknowledged && <TableHead>Acknowledged</TableHead>}
              {columns.acknowledgedAt && <TableHead>Acknowledged At</TableHead>}
            </>
          )}
          {responseType === 'yes-no' && (
            <>
              {columns.response && <TableHead>Response</TableHead>}
              {columns.respondedAt && <TableHead>Responded At</TableHead>}
            </>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {recipients.map((recipient) => (
          <TableRow key={recipient.studentId}>
            <TableCell className="font-medium">{recipient.studentName}</TableCell>
            <TableCell className="text-muted-foreground">{recipient.classLabel}</TableCell>
            {columns.readStatus && (
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
            )}
            {columns.readAt && (
              <TableCell className="text-muted-foreground">
                {recipient.readStatus === 'read' ? formatDate(recipient.respondedAt) : '\u2014'}
              </TableCell>
            )}
            {responseType === 'acknowledge' && (
              <>
                {columns.acknowledged && (
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
                )}
                {columns.acknowledgedAt && (
                  <TableCell className="text-muted-foreground">
                    {formatDate(recipient.acknowledgedAt)}
                  </TableCell>
                )}
              </>
            )}
            {responseType === 'yes-no' && (
              <>
                {columns.response && (
                  <TableCell>
                    {recipient.formResponse === 'yes' ? (
                      <Badge variant="success">Yes</Badge>
                    ) : recipient.formResponse === 'no' ? (
                      <Badge variant="destructive">No</Badge>
                    ) : (
                      <span className="text-muted-foreground">{'\u2014'}</span>
                    )}
                  </TableCell>
                )}
                {columns.respondedAt && (
                  <TableCell className="text-muted-foreground">
                    {formatDate(recipient.respondedAt)}
                  </TableCell>
                )}
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
  columns,
}: {
  recipients: PGConsentFormRecipient[];
  responseType: 'acknowledge' | 'yes-no';
  columns: RecipientFilterValue['columns'];
}) {
  const responseLabel = responseType === 'acknowledge' ? 'Acknowledged' : 'Response';

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Student</TableHead>
          <TableHead>Class</TableHead>
          {columns.response && <TableHead>{responseLabel}</TableHead>}
          {columns.respondedAt && <TableHead>Responded At</TableHead>}
          {columns.pgStatus && <TableHead>PG Status</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {recipients.map((recipient) => (
          <TableRow key={recipient.studentId}>
            <TableCell className="font-medium">{recipient.studentName}</TableCell>
            <TableCell className="text-muted-foreground">{recipient.classLabel}</TableCell>
            {columns.response && (
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
            )}
            {columns.respondedAt && (
              <TableCell className="text-muted-foreground">
                {recipient.respondedAt ? formatDate(recipient.respondedAt) : '\u2014'}
              </TableCell>
            )}
            {columns.pgStatus && (
              <TableCell className="text-muted-foreground">
                {recipient.pgStatus === 'onboarded' ? 'Onboarded' : 'Not Onboarded'}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * Column options surfaced in the Filter popover. Returns only the columns
 * that actually apply to this post kind + response type, so the popover
 * doesn't show toggles for columns the table wouldn't have rendered anyway.
 */
function resolveColumnOptions(
  kind: 'announcement' | 'form',
  responseType: ResponseType | 'acknowledge' | 'yes-no',
): ColumnOption[] {
  if (kind === 'announcement') {
    const base: ColumnOption[] = [
      { key: 'readStatus', label: 'Read Status' },
      { key: 'readAt', label: 'Read At' },
    ];
    if (responseType === 'acknowledge') {
      base.push(
        { key: 'acknowledged', label: 'Acknowledged' },
        { key: 'acknowledgedAt', label: 'Acknowledged At' },
      );
    } else if (responseType === 'yes-no') {
      base.push(
        { key: 'response', label: 'Response' },
        { key: 'respondedAt', label: 'Responded At' },
      );
    }
    return base;
  }
  return [
    { key: 'response', label: responseType === 'acknowledge' ? 'Acknowledged' : 'Response' },
    { key: 'respondedAt', label: 'Responded At' },
    { key: 'pgStatus', label: 'PG Status' },
  ];
}

/**
 * Project filtered rows into CSV columns respecting the current column
 * visibility. `Student` + `Class` are always included (identity anchors —
 * matches PGW's "Show Columns" behavior which never hides name/class).
 */
function buildCsvColumns(
  kind: 'announcement' | 'form',
  responseType: ResponseType | 'acknowledge' | 'yes-no',
  columns: RecipientFilterValue['columns'],
): CsvColumn<Record<string, string>>[] {
  const out: CsvColumn<Record<string, string>>[] = [
    { key: 'studentName', header: 'Student' },
    { key: 'classLabel', header: 'Class' },
  ];
  if (kind === 'announcement') {
    if (columns.readStatus) out.push({ key: 'readStatus', header: 'Read Status' });
    if (columns.readAt) out.push({ key: 'readAt', header: 'Read At' });
    if (responseType === 'acknowledge') {
      if (columns.acknowledged) out.push({ key: 'acknowledged', header: 'Acknowledged' });
      if (columns.acknowledgedAt) out.push({ key: 'acknowledgedAt', header: 'Acknowledged At' });
    } else if (responseType === 'yes-no') {
      if (columns.response) out.push({ key: 'response', header: 'Response' });
      if (columns.respondedAt) out.push({ key: 'respondedAt', header: 'Responded At' });
    }
  } else {
    const responseHeader = responseType === 'acknowledge' ? 'Acknowledged' : 'Response';
    if (columns.response) out.push({ key: 'response', header: responseHeader });
    if (columns.respondedAt) out.push({ key: 'respondedAt', header: 'Responded At' });
    if (columns.pgStatus) out.push({ key: 'pgStatus', header: 'PG Status' });
  }
  return out;
}

function announcementRowToCsv(r: PGRecipient): Record<string, string> {
  return {
    studentName: r.studentName,
    classLabel: r.classLabel,
    readStatus: r.readStatus === 'read' ? 'Read' : 'Unread',
    readAt: r.readStatus === 'read' ? (formatDate(r.respondedAt) ?? '') : '',
    acknowledged: r.acknowledgedAt ? 'Yes' : 'No',
    acknowledgedAt: formatDate(r.acknowledgedAt) ?? '',
    response: r.formResponse === 'yes' ? 'Yes' : r.formResponse === 'no' ? 'No' : 'Pending',
    respondedAt: formatDate(r.respondedAt) ?? '',
  };
}

function consentFormRowToCsv(r: PGConsentFormRecipient): Record<string, string> {
  return {
    studentName: r.studentName,
    classLabel: r.classLabel,
    response: r.response === 'YES' ? 'Yes' : r.response === 'NO' ? 'No' : 'Pending',
    respondedAt: r.respondedAt ? (formatDate(r.respondedAt) ?? '') : '',
    pgStatus: r.pgStatus === 'onboarded' ? 'Onboarded' : 'Not Onboarded',
  };
}

export function RecipientReadTable(props: RecipientReadTableProps) {
  const isForm = props.kind === 'form';
  const controlled = props.filter !== undefined;

  const [uncontrolledFilter, setUncontrolledFilter] =
    useState<RecipientFilterValue>(DEFAULT_RECIPIENT_FILTER);
  const filter = controlled ? props.filter! : uncontrolledFilter;
  const onFilterChange = controlled ? props.onFilterChange! : setUncontrolledFilter;

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

  const columnOptions = useMemo(
    () => resolveColumnOptions(isForm ? 'form' : 'announcement', props.responseType),
    [isForm, props.responseType],
  );

  const handleExport = () => {
    const csvColumns = buildCsvColumns(
      isForm ? 'form' : 'announcement',
      props.responseType,
      filter.columns,
    );
    const rows = isForm
      ? (filteredRecipients as PGConsentFormRecipient[]).map(consentFormRowToCsv)
      : (filteredRecipients as PGRecipient[]).map(announcementRowToCsv);
    const today = new Date().toISOString().slice(0, 10);
    const stem = props.exportId ? `recipients-${props.exportId}-${today}` : `recipients-${today}`;
    downloadCsv(`${stem}.csv`, toCsv({ columns: csvColumns, rows }));
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
        onFilterChange={onFilterChange}
        classOptions={classOptions}
        showReadStatus={!isForm}
        showPgStatus={isForm}
        columnOptions={columnOptions}
        showDeferredNote={!isForm}
        onExport={handleExport}
      />

      <div className="overflow-x-auto rounded-xl border">
        {filteredRecipients.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-muted-foreground">
            No recipients match these filters.
          </p>
        ) : isForm ? (
          <ConsentFormTable
            recipients={filteredRecipients as PGConsentFormRecipient[]}
            responseType={props.responseType}
            columns={filter.columns}
          />
        ) : (
          <AnnouncementTable
            recipients={filteredRecipients as PGRecipient[]}
            responseType={props.responseType}
            columns={filter.columns}
          />
        )}
      </div>
    </div>
  );
}
