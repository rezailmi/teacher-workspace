import type { Editor } from '@tiptap/react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  List,
  ListOrdered,
  Underline as UnderlineIcon,
} from 'lucide-react';

import { Button } from '~/components/ui';
import { cn } from '~/lib/utils';

interface RichTextToolbarProps {
  editor: Editor | null;
  className?: string;
}

interface ButtonProps {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function ToolbarButton({ label, icon, active, disabled, onClick }: ButtonProps) {
  // onMouseDown preventDefault keeps ProseMirror's selection alive across the
  // click — without it, focus leaves the editor before the command runs and
  // the selection collapses.
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="size-7 rounded text-muted-foreground aria-pressed:bg-accent aria-pressed:text-foreground"
    >
      {icon}
    </Button>
  );
}

function Divider() {
  return <div className="mx-1 h-4 w-px bg-border" />;
}

function RichTextToolbar({ editor, className }: RichTextToolbarProps) {
  // The toolbar renders before the editor finishes mounting; a null editor
  // means "not ready yet", so leave buttons visually disabled rather than
  // hiding the bar (avoids a layout shift when the editor attaches).
  const disabled = !editor;

  function toggle(name: string) {
    if (!editor) return;
    // `editor.chain().focus().toggleX().run()` is the canonical Tiptap pattern;
    // focus() keeps the selection where the user expected it.
    switch (name) {
      case 'bold':
        editor.chain().focus().toggleBold().run();
        break;
      case 'italic':
        editor.chain().focus().toggleItalic().run();
        break;
      case 'underline':
        editor.chain().focus().toggleUnderline().run();
        break;
      case 'alignLeft':
        editor.chain().focus().setTextAlign('left').run();
        break;
      case 'alignCenter':
        editor.chain().focus().setTextAlign('center').run();
        break;
      case 'alignRight':
        editor.chain().focus().setTextAlign('right').run();
        break;
      case 'alignJustify':
        editor.chain().focus().setTextAlign('justify').run();
        break;
      case 'bulletList':
        editor.chain().focus().toggleBulletList().run();
        break;
      case 'orderedList':
        editor.chain().focus().toggleOrderedList().run();
        break;
    }
  }

  return (
    <div
      className={cn(
        // `bg-sidebar` is the token alias for slate-2 — used here for a chrome surface outside <Sidebar/>.
        'flex flex-wrap items-center gap-0.5 rounded-t-xl border bg-sidebar px-2 py-1.5',
        className,
      )}
    >
      <ToolbarButton
        label="Bold"
        icon={<Bold className="h-4 w-4" />}
        active={editor?.isActive('bold')}
        disabled={disabled}
        onClick={() => toggle('bold')}
      />
      <ToolbarButton
        label="Italic"
        icon={<Italic className="h-4 w-4" />}
        active={editor?.isActive('italic')}
        disabled={disabled}
        onClick={() => toggle('italic')}
      />
      <ToolbarButton
        label="Underline"
        icon={<UnderlineIcon className="h-4 w-4" />}
        active={editor?.isActive('underline')}
        disabled={disabled}
        onClick={() => toggle('underline')}
      />

      <Divider />

      <ToolbarButton
        label="Align left"
        icon={<AlignLeft className="h-4 w-4" />}
        active={editor?.isActive({ textAlign: 'left' })}
        disabled={disabled}
        onClick={() => toggle('alignLeft')}
      />
      <ToolbarButton
        label="Align center"
        icon={<AlignCenter className="h-4 w-4" />}
        active={editor?.isActive({ textAlign: 'center' })}
        disabled={disabled}
        onClick={() => toggle('alignCenter')}
      />
      <ToolbarButton
        label="Align right"
        icon={<AlignRight className="h-4 w-4" />}
        active={editor?.isActive({ textAlign: 'right' })}
        disabled={disabled}
        onClick={() => toggle('alignRight')}
      />
      <ToolbarButton
        label="Align justify"
        icon={<AlignJustify className="h-4 w-4" />}
        active={editor?.isActive({ textAlign: 'justify' })}
        disabled={disabled}
        onClick={() => toggle('alignJustify')}
      />

      <Divider />

      <ToolbarButton
        label="Bullet list"
        icon={<List className="h-4 w-4" />}
        active={editor?.isActive('bulletList')}
        disabled={disabled}
        onClick={() => toggle('bulletList')}
      />
      <ToolbarButton
        label="Numbered list"
        icon={<ListOrdered className="h-4 w-4" />}
        active={editor?.isActive('orderedList')}
        disabled={disabled}
        onClick={() => toggle('orderedList')}
      />
    </div>
  );
}

export { RichTextToolbar };
export type { RichTextToolbarProps };
