import { FileText, ImageIcon, Loader2, Paperclip, Trash2 } from 'lucide-react';
import { useRef, type Dispatch } from 'react';

import type { AttachmentUploadType } from '~/api/client';
import { uploadAttachment } from '~/api/client';
import { Badge, Button } from '~/components/ui';
import type { PostFormAction, UploadingFile } from '~/containers/CreatePostView';
import {
  ALLOWED_FILE_MIME,
  ALLOWED_PHOTO_MIME,
  formatFileSize,
  MAX_ITEMS,
  validateUploadFile,
  type UploadKind,
} from '~/helpers/attachments';
import { notify } from '~/lib/notify';

interface AttachmentSectionProps {
  files: UploadingFile[];
  photos: UploadingFile[];
  dispatch: Dispatch<PostFormAction>;
  /**
   * Routes the `type` field on `preUploadValidation`. Announcements and
   * consent forms use distinct PG domain tags even though the wire shape is
   * the same.
   */
  kind: AttachmentUploadType;
}

function AttachmentSection({ files, photos, dispatch, kind }: AttachmentSectionProps) {
  return (
    <div className="space-y-6">
      <p className="font-medium">Attachments</p>

      <UploadSubSection
        label="Files"
        uploadKind="file"
        items={files}
        dispatch={dispatch}
        uploadType={kind}
        accept={ALLOWED_FILE_MIME.join(',')}
        pickerLabel="Add files"
        pickerIcon={<Paperclip className="h-4 w-4" />}
        fallbackIcon={<FileText className="h-5 w-5" />}
        copy={`Add up to ${MAX_ITEMS} files, less than 5 MB each.`}
      />

      <UploadSubSection
        label="Photos"
        uploadKind="photo"
        items={photos}
        dispatch={dispatch}
        uploadType={kind}
        accept={ALLOWED_PHOTO_MIME.join(',')}
        pickerLabel="Add photos"
        pickerIcon={<ImageIcon className="h-4 w-4" />}
        fallbackIcon={<ImageIcon className="h-5 w-5" />}
        copy={`Add up to ${MAX_ITEMS} photos, less than 5 MB each.`}
      />
    </div>
  );
}

interface UploadSubSectionProps {
  label: string;
  uploadKind: UploadKind;
  items: UploadingFile[];
  dispatch: Dispatch<PostFormAction>;
  uploadType: AttachmentUploadType;
  accept: string;
  pickerLabel: string;
  pickerIcon: React.ReactNode;
  fallbackIcon: React.ReactNode;
  copy: string;
}

function UploadSubSection({
  label,
  uploadKind,
  items,
  dispatch,
  uploadType,
  accept,
  pickerLabel,
  pickerIcon,
  fallbackIcon,
  copy,
}: UploadSubSectionProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const readyCount = items.filter((i) => i.status === 'ready').length;
  const atCap = items.length >= MAX_ITEMS;

  const onPick = async (picked: FileList | null) => {
    if (!picked) return;
    // Copy the FileList into a plain array before we start dispatching —
    // the input's .files reference is mutated when we reset it below.
    const candidates = Array.from(picked);
    for (const file of candidates) {
      const result = validateUploadFile(file, uploadKind, items.length);
      if (!result.ok) {
        notify.error(result.reason);
        continue;
      }

      const localId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `upload-${Date.now()}-${Math.random()}`;

      dispatch({
        type: 'ADD_UPLOAD',
        kind: uploadKind,
        payload: { localId, name: file.name, size: file.size, mimeType: file.type },
      });

      void uploadAttachment(file, uploadType, (stage) => {
        dispatch({
          type: 'UPDATE_UPLOAD',
          kind: uploadKind,
          localId,
          patch: { status: stage },
        });
      })
        .then(({ attachmentId, url }) => {
          dispatch({
            type: 'UPDATE_UPLOAD',
            kind: uploadKind,
            localId,
            patch: { status: 'ready', attachmentId, url, thumbnailUrl: url },
          });
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : 'Upload failed.';
          dispatch({
            type: 'UPDATE_UPLOAD',
            kind: uploadKind,
            localId,
            patch: { status: 'error', error: message },
          });
        });
    }

    // Reset the input so the same file can be picked again after an error.
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">
        {label} {readyCount}/{MAX_ITEMS}
      </p>
      <p className="text-sm text-muted-foreground">{copy}</p>

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item) => (
            <UploadRow
              key={item.localId}
              item={item}
              fallbackIcon={fallbackIcon}
              onRemove={() =>
                dispatch({
                  type: 'REMOVE_UPLOAD',
                  kind: uploadKind,
                  localId: item.localId,
                })
              }
              onSelectCover={
                uploadKind === 'photo'
                  ? () => dispatch({ type: 'SET_COVER_PHOTO', localId: item.localId })
                  : undefined
              }
            />
          ))}
        </ul>
      )}

      <Button
        variant="secondary"
        size="sm"
        disabled={atCap}
        onClick={() => inputRef.current?.click()}
      >
        {pickerIcon}
        {pickerLabel}
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={(e) => {
          void onPick(e.target.files);
        }}
      />
    </div>
  );
}

function UploadRow({
  item,
  fallbackIcon,
  onRemove,
  onSelectCover,
}: {
  item: UploadingFile;
  fallbackIcon: React.ReactNode;
  onRemove: () => void;
  onSelectCover?: () => void;
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl border p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
        {item.kind === 'photo' && item.status === 'ready' && item.thumbnailUrl ? (
          <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          fallbackIcon
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.name}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{formatFileSize(item.size)}</span>
          <span>·</span>
          <StatusChip item={item} />
        </div>
      </div>

      {item.kind === 'photo' && onSelectCover && (
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="radio"
            name="cover-photo"
            checked={!!item.isCover}
            onChange={onSelectCover}
            className="h-3.5 w-3.5"
          />
          Cover
        </label>
      )}

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-destructive"
        aria-label={`Remove ${item.name}`}
        onClick={onRemove}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
}

function StatusChip({ item }: { item: UploadingFile }) {
  if (item.status === 'ready') {
    return <Badge variant="success">Ready</Badge>;
  }
  if (item.status === 'error') {
    return <Badge variant="destructive">{item.error ?? 'Failed'}</Badge>;
  }
  const label = item.status === 'verifying' ? 'Scanning…' : 'Uploading…';
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" />
      {label}
    </span>
  );
}

export { AttachmentSection };
export type { AttachmentSectionProps };
