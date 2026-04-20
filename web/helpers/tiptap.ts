// Tiptap helpers shared between the editor container and the wire-boundary
// mappers. Keep them here so both sides reach for a single implementation —
// the Tiptap schema lives here, not in two places that can drift.

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
