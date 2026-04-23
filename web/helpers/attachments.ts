/**
 * Constants + pure validators for post attachment uploads. The PG contract
 * caps both files and photos at 3 per post, 5 MB per item — see
 * `docs/plans/2026-04-23-001-feat-file-attachments-plan.md` R1/R2.
 */

export const MAX_ITEMS = 3;
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/** Documents: PDF + the modern + legacy Microsoft Office MIME types. */
export const ALLOWED_FILE_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;

export const ALLOWED_PHOTO_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type UploadKind = 'file' | 'photo';

type ValidationResult = { ok: true } | { ok: false; reason: string };

/**
 * Validate a picked file for upload. Ordering is deliberate — the most
 * specific rejection wins. A user picking a 10 MB `.exe` when they've
 * already hit the cap sees a "too many" message (the actionable one) rather
 * than MIME feedback for a file that wouldn't be accepted anyway.
 */
export function validateUploadFile(
  file: File,
  kind: UploadKind,
  existingCount: number,
): ValidationResult {
  if (existingCount >= MAX_ITEMS) {
    return { ok: false, reason: `You can attach up to ${MAX_ITEMS} items.` };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { ok: false, reason: 'File exceeds 5 MB.' };
  }
  const allowed = kind === 'file' ? ALLOWED_FILE_MIME : ALLOWED_PHOTO_MIME;
  if (!(allowed as readonly string[]).includes(file.type)) {
    return { ok: false, reason: 'Unsupported file type.' };
  }
  return { ok: true };
}

/**
 * Human-readable size. B / KB / MB — we don't need GB since the cap is 5 MB.
 * KB and MB use one decimal place to disambiguate near-boundary values
 * (`999 KB` vs `1.0 MB` is clearer than `1 MB`).
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}
