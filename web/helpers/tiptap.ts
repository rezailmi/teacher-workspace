// Tiptap helpers shared between the editor container and the wire-boundary
// mappers. Keep them here so both sides reach for a single implementation —
// the Tiptap schema lives here, not in two places that can drift.

import CharacterCount from '@tiptap/extension-character-count';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import StarterKit from '@tiptap/starter-kit';

/**
 * Extension set shared by the live editor (`useEditor`) and the static
 * preview (`generateHTML`). Keeping both sides on the same schema is what
 * makes the preview pixel-match what the teacher typed.
 */
export function createRichTextExtensions(opts?: { maxLength?: number }) {
  return [
    // StarterKit v3 bundles link + underline; we disable them so the
    // standalone extensions below register with our own config.
    StarterKit.configure({ codeBlock: false, link: false, underline: false }),
    Underline,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      protocols: ['http', 'https', 'mailto'],
    }),
    Highlight,
    ...(opts?.maxLength != null ? [CharacterCount.configure({ limit: opts.maxLength })] : []),
  ];
}

export function textToTiptapDoc(text: string): Record<string, unknown> {
  return {
    type: 'doc',
    content: text
      ? text.split('\n').map((line) => ({
          type: 'paragraph',
          content: line ? [{ type: 'text', text: line }] : [],
        }))
      : [{ type: 'paragraph' }],
  };
}

interface TiptapNode {
  type?: string;
  content?: TiptapNode[];
  text?: string;
}

function extractText(node: TiptapNode): string {
  if (typeof node.text === 'string') return node.text;
  if (!Array.isArray(node.content)) return '';

  const parts = node.content.map(extractText);
  return node.type === 'doc' ? parts.join('\n') : parts.join('');
}

/**
 * Extract plain text from a Tiptap doc. PG sends it as a parsed object; legacy
 * fixtures may send a JSON string — handle both.
 */
export function extractTextFromTiptap(
  rich: Record<string, unknown> | string | null | undefined,
): string {
  if (rich == null) return '';
  if (typeof rich === 'string') {
    try {
      return extractText(JSON.parse(rich) as TiptapNode).trim();
    } catch {
      return rich.trim();
    }
  }
  return extractText(rich).trim();
}
