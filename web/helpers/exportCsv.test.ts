import { describe, expect, it } from 'vitest';

import { toCsv } from './exportCsv';

describe('toCsv', () => {
  it('serialises a simple table with header + rows', () => {
    const result = toCsv({
      columns: [
        { key: 'name', header: 'Name' },
        { key: 'class', header: 'Class' },
      ],
      rows: [
        { name: 'Tan Xiao Ming', class: '4A' },
        { name: 'Lee Wei Liang', class: '4B' },
      ],
    });
    // Strip the BOM for string comparison.
    expect(result.replace(/^\uFEFF/, '')).toBe(
      ['Name,Class', 'Tan Xiao Ming,4A', 'Lee Wei Liang,4B'].join('\r\n') + '\r\n',
    );
  });

  it('prepends a UTF-8 BOM so Excel auto-detects the encoding', () => {
    const result = toCsv({
      columns: [{ key: 'name', header: 'Name' }],
      rows: [{ name: 'Tan' }],
    });
    expect(result.charCodeAt(0)).toBe(0xfeff);
  });

  it('escapes commas inside fields by wrapping in double quotes', () => {
    const result = toCsv({
      columns: [{ key: 'name', header: 'Name' }],
      rows: [{ name: 'Last, First' }],
    });
    expect(result).toContain('"Last, First"');
  });

  it('escapes double-quotes by doubling them (RFC 4180)', () => {
    const result = toCsv({
      columns: [{ key: 'note', header: 'Note' }],
      rows: [{ note: 'She said "hello"' }],
    });
    expect(result).toContain('"She said ""hello"""');
  });

  it('wraps fields containing newlines in double quotes', () => {
    const result = toCsv({
      columns: [{ key: 'note', header: 'Note' }],
      rows: [{ note: 'line 1\nline 2' }],
    });
    expect(result).toContain('"line 1\nline 2"');
  });

  it('renders null/undefined as empty strings', () => {
    const result = toCsv({
      columns: [
        { key: 'a', header: 'A' },
        { key: 'b', header: 'B' },
      ],
      rows: [
        { a: 'x', b: null },
        { a: undefined, b: 'y' },
      ],
    });
    expect(result.replace(/^\uFEFF/, '')).toBe(['A,B', 'x,', ',y'].join('\r\n') + '\r\n');
  });

  it('supports a column formatter for non-string values', () => {
    const result = toCsv({
      columns: [
        { key: 'count', header: 'Count', format: (v) => String(v) },
        { key: 'flag', header: 'Flag', format: (v) => (v ? 'yes' : 'no') },
      ],
      rows: [{ count: 42, flag: true }],
    });
    expect(result).toContain('42,yes');
  });
});
