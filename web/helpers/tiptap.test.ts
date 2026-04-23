import { getSchema } from '@tiptap/core';
import { describe, expect, it } from 'vitest';

import { createRichTextExtensions } from './tiptap';

describe('rich-text extension schema', () => {
  it('exposes the PGW allowlist of nodes', () => {
    const schema = getSchema(createRichTextExtensions());
    const nodeNames = Object.keys(schema.nodes).sort();
    // PGW allows these; anything else would fail `isValidSchema` server-side.
    expect(nodeNames).toEqual(
      expect.arrayContaining([
        'doc',
        'paragraph',
        'text',
        'bulletList',
        'orderedList',
        'listItem',
        'hardBreak',
      ]),
    );
    expect(nodeNames).not.toContain('heading');
    expect(nodeNames).not.toContain('blockquote');
    expect(nodeNames).not.toContain('codeBlock');
    expect(nodeNames).not.toContain('horizontalRule');
  });

  it('exposes the PGW allowlist of marks', () => {
    const schema = getSchema(createRichTextExtensions());
    const markNames = Object.keys(schema.marks).sort();
    expect(markNames).toEqual(expect.arrayContaining(['bold', 'italic', 'underline']));
    expect(markNames).not.toContain('link');
    expect(markNames).not.toContain('highlight');
    expect(markNames).not.toContain('strike');
    expect(markNames).not.toContain('code');
  });
});
