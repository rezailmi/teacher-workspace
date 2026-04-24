// Tiptap helpers shared between the editor container and the wire-boundary
// mappers. Keep them here so both sides reach for a single implementation —
// the Tiptap schema lives here, not in two places that can drift.

import CharacterCount from '@tiptap/extension-character-count';
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
    // StarterKit ships many extensions bundled — disable every node/mark that
    // PGW's schema validator (`pgw-web/src/server/utils/richTextUtil.ts#101`)
    // rejects. The final allowlist matches `pgw-web` exactly:
    // doc, paragraph, text, bold, italic, underline, bulletList, orderedList,
    // listItem, hardBreak, history.
    //
    // TODO: widen this set once PGW's allowlist opens up. Candidates the
    // toolbar used to expose (see commit 6fe31cb that narrowed it): headings
    // (h1–h3), strike, inline code, blockquote, highlight, link. Re-enabling
    // here requires a matching change in `pgw-web/src/server/utils/richTextUtil.ts`
    // or prod submits will be rejected.
    StarterKit.configure({
      // Use the standalone Underline extension below for consistency with pgw-web.
      underline: false,
      // Not allowed by PGW's schema:
      link: false,
      heading: false,
      strike: false,
      code: false,
      blockquote: false,
      codeBlock: false,
      horizontalRule: false,
    }),
    Underline,
    // `justify` matches pgw-web's alignment set. Only paragraph + lists get
    // textAlign (pgw-web uses `['paragraph', 'orderedList', 'bulletList']`).
    TextAlign.configure({
      types: ['paragraph', 'orderedList', 'bulletList'],
      alignments: ['left', 'center', 'right', 'justify'],
    }),
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
