/**
 * RFC 4180 CSV serialisation + a thin browser-download helper.
 *
 * Excel opens UTF-8 CSVs correctly only when a BOM is present at the start
 * of the file (otherwise non-ASCII names garble on Windows). The BOM is
 * preserved by `toCsv` and carried into the `downloadCsv` blob.
 */

type CellValue = string | number | boolean | null | undefined;

export interface CsvColumn<Row> {
  key: keyof Row & string;
  header: string;
  /** Optional per-cell formatter; defaults to `String(value)` for non-nullish. */
  format?: (value: Row[keyof Row]) => string;
}

export interface CsvInput<Row> {
  columns: CsvColumn<Row>[];
  rows: Row[];
}

const CRLF = '\r\n';
const BOM = '\uFEFF';

/**
 * Build the CSV string. Exported separately from `downloadCsv` so tests can
 * assert the exact bytes without needing DOM shims.
 */
export function toCsv<Row>({ columns, rows }: CsvInput<Row>): string {
  const headerLine = columns.map((c) => escapeField(c.header)).join(',');
  const body = rows.map((row) =>
    columns
      .map((c) => {
        const raw = row[c.key];
        if (raw === null || raw === undefined) return '';
        const stringified = c.format
          ? c.format(raw)
          : typeof raw === 'string'
            ? raw
            : String(raw as CellValue);
        return escapeField(stringified);
      })
      .join(','),
  );
  // Trailing CRLF after the last row — matches what Excel writes out, and
  // Excel/Numbers/Sheets all tolerate the extra blank line.
  return BOM + [headerLine, ...body].join(CRLF) + CRLF;
}

/** Trigger a browser download of the given CSV content. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeField(value: string): string {
  // Defeat Excel / LibreOffice / Google Sheets formula injection: any field
  // starting with `=`, `+`, `-`, or `@` is treated as a formula unless we
  // neutralise it with a leading tab. The tab is stripped visually but
  // prevents execution on open.
  let safe = value;
  if (/^[=+\-@\t\r]/.test(safe)) {
    safe = `\t${safe}`;
  }
  if (safe.includes(',') || safe.includes('"') || safe.includes('\n') || safe.includes('\r')) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}
