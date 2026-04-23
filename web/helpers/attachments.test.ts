import { describe, expect, it } from 'vitest';

import {
  ALLOWED_FILE_MIME,
  ALLOWED_PHOTO_MIME,
  formatFileSize,
  MAX_FILE_SIZE_BYTES,
  MAX_ITEMS,
  validateUploadFile,
} from './attachments';

function makeFile(mime: string, sizeBytes: number, name = 'test'): File {
  // `new File(..., { type })` lets us set the MIME; size is derived from the
  // blob parts. A single repeated string keeps allocation cheap.
  const blob = new Blob(['x'.repeat(sizeBytes)], { type: mime });
  return new File([blob], name, { type: mime });
}

describe('validateUploadFile', () => {
  it('accepts a valid PDF under the size cap (file kind)', () => {
    const file = makeFile('application/pdf', 1024 * 1024, 'permission_slip.pdf');
    expect(validateUploadFile(file, 'file', 0)).toEqual({ ok: true });
  });

  it('accepts a valid PNG (photo kind)', () => {
    const file = makeFile('image/png', 500 * 1024, 'cover.png');
    expect(validateUploadFile(file, 'photo', 0)).toEqual({ ok: true });
  });

  it('accepts a file exactly at the size cap (inclusive boundary)', () => {
    const file = makeFile('application/pdf', MAX_FILE_SIZE_BYTES);
    expect(validateUploadFile(file, 'file', 0)).toEqual({ ok: true });
  });

  it('rejects a file one byte over the size cap', () => {
    const file = makeFile('application/pdf', MAX_FILE_SIZE_BYTES + 1);
    const result = validateUploadFile(file, 'file', 0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/5 MB/);
  });

  it('rejects when count already at MAX_ITEMS (count check runs before size/mime)', () => {
    const file = makeFile('application/octet-stream', MAX_FILE_SIZE_BYTES * 10);
    const result = validateUploadFile(file, 'file', MAX_ITEMS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(new RegExp(String(MAX_ITEMS)));
  });

  it('rejects an unsupported MIME type', () => {
    const file = makeFile('application/x-msdownload', 1024, 'virus.exe');
    const result = validateUploadFile(file, 'file', 0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/supported/i);
  });

  it('rejects a photo MIME when file kind is expected', () => {
    const file = makeFile('image/jpeg', 1024, 'oops.jpg');
    expect(validateUploadFile(file, 'file', 0).ok).toBe(false);
  });

  it('rejects a PDF MIME when photo kind is expected', () => {
    const file = makeFile('application/pdf', 1024, 'oops.pdf');
    expect(validateUploadFile(file, 'photo', 0).ok).toBe(false);
  });

  it('exposes expected MIME allowlists', () => {
    expect(ALLOWED_FILE_MIME).toContain('application/pdf');
    expect(ALLOWED_FILE_MIME).toContain(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(ALLOWED_PHOTO_MIME).toEqual(
      expect.arrayContaining(['image/jpeg', 'image/png', 'image/webp']),
    );
  });
});

describe('formatFileSize', () => {
  it('formats bytes under 1 KB', () => {
    expect(formatFileSize(500)).toMatch(/500/);
    expect(formatFileSize(500)).toMatch(/B/);
  });

  it('formats a whole KB value', () => {
    expect(formatFileSize(1024)).toMatch(/1\.0 KB/);
  });

  it('formats a fractional MB value', () => {
    expect(formatFileSize(1024 * 1024 * 2.5)).toMatch(/2\.5 MB/);
  });
});
