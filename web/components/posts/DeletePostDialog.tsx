import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui';

interface DeletePostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * `'draft'` collapses the dialog to a single-option confirm ("This draft
   * will be permanently removed."). `'posted'` spells out the "removed from
   * the PG app for everyone" consequence. `null` renders nothing — the
   * caller uses this when no row is armed for deletion.
   */
  mode: 'draft' | 'posted' | null;
  /** Post title surfaced in the description so teachers see what they're about to delete. */
  title: string;
  onConfirm: () => void;
  /** Disables the primary button while the delete request is in flight. */
  pending?: boolean;
}

function DeletePostDialog({
  open,
  onOpenChange,
  mode,
  title,
  onConfirm,
  pending = false,
}: DeletePostDialogProps) {
  if (!mode) return null;

  const isDraft = mode === 'draft';
  const description = isDraft
    ? 'This draft will be permanently removed.'
    : 'This post has been sent to parents. Deleting will remove it from the Parents Gateway app for everyone. This cannot be undone.';
  const confirmLabel = isDraft ? 'Delete draft' : 'Delete for everyone';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete post?</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <p className="text-sm text-muted-foreground">Post</p>
          <p className="truncate text-sm font-medium">{title || 'Untitled'}</p>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { DeletePostDialog };
export type { DeletePostDialogProps };
