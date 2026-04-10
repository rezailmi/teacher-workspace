import { Typography } from '@flow/core';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui';
import type { ResponseType } from '~/data/mock-pg-announcements';

const RESPONSE_TYPE_LABELS: Record<ResponseType, string> = {
  'view-only': 'View Only',
  acknowledge: 'Acknowledge',
  'yes-no': 'Yes / No',
};

interface SendConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  recipientCount: number;
  responseType: ResponseType;
  onConfirm: () => void;
}

function SendConfirmationDialog({
  open,
  onOpenChange,
  title,
  recipientCount,
  responseType,
  onConfirm,
}: SendConfirmationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send Post</DialogTitle>
          <DialogDescription>
            Are you sure you want to send this post? This action cannot be
            undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex justify-between">
            <Typography variant="body-sm" className="text-muted-foreground">
              Title
            </Typography>
            <Typography variant="body-sm" className="font-medium text-right max-w-[240px] truncate">
              {title || 'Untitled'}
            </Typography>
          </div>
          <div className="flex justify-between">
            <Typography variant="body-sm" className="text-muted-foreground">
              Recipients
            </Typography>
            <Typography variant="body-sm" className="font-medium">
              {recipientCount} students
            </Typography>
          </div>
          <div className="flex justify-between">
            <Typography variant="body-sm" className="text-muted-foreground">
              Response Type
            </Typography>
            <Typography variant="body-sm" className="font-medium">
              {RESPONSE_TYPE_LABELS[responseType]}
            </Typography>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="default" onClick={onConfirm}>
            Send Now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { SendConfirmationDialog };
export type { SendConfirmationDialogProps };
