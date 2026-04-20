import { CalendarClock, ChevronDown, Send } from 'lucide-react';
import { useState } from 'react';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui';

interface SplitPostButtonProps {
  disabled?: boolean;
  onPost: () => void;
  /**
   * Schedule handler. When omitted (e.g. PG flag
   * `schedule_announcement_form_post` reports the feature off), the
   * dropdown menu hides the "Schedule for later" entry entirely and the
   * component renders as a plain Post button.
   */
  onSchedule?: () => void;
}

type SplitAction = 'post' | 'schedule';

function SplitPostButton({ disabled, onPost, onSchedule }: SplitPostButtonProps) {
  const [action, setAction] = useState<SplitAction>('post');
  const scheduleAvailable = Boolean(onSchedule);
  // Fall back to Post rendering if the caller dropped the schedule handler
  // mid-session (e.g. flag refetch flipped it off). Keeps the main button
  // honest about what clicking it will do.
  const effectiveAction: SplitAction = scheduleAvailable ? action : 'post';

  function handleMainClick() {
    if (effectiveAction === 'schedule' && onSchedule) {
      onSchedule();
    } else {
      onPost();
    }
  }

  // When schedule is gated off, collapse to a plain primary Post button;
  // there's no second menu entry worth a split UI.
  if (!scheduleAvailable) {
    return (
      <Button variant="default" size="sm" disabled={disabled} onClick={onPost}>
        <Send className="mr-1.5 h-4 w-4" />
        Post
      </Button>
    );
  }

  return (
    <div className="flex overflow-hidden rounded-full">
      <Button
        variant="default"
        size="sm"
        disabled={disabled}
        onClick={handleMainClick}
        className="rounded-r-none"
      >
        {effectiveAction === 'schedule' ? (
          <CalendarClock className="mr-1.5 h-4 w-4" />
        ) : (
          <Send className="mr-1.5 h-4 w-4" />
        )}
        {effectiveAction === 'schedule' ? 'Schedule' : 'Post'}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="default"
              size="sm"
              disabled={disabled}
              className="rounded-l-none border-l border-primary-foreground/20 px-2"
            />
          }
        >
          <ChevronDown className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setAction('post')}>
            <Send className="mr-2 h-4 w-4" />
            Post now
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setAction('schedule')}>
            <CalendarClock className="mr-2 h-4 w-4" />
            Schedule for later
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export { SplitPostButton };
export type { SplitPostButtonProps };
