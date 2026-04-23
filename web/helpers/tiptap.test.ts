import { describe, expect, it } from 'vitest';

import { createRichTextExtensions } from './tiptap';

interface AnyExt {
  name: string;
  config: { addOptions: () => Record<string, unknown> };
}

function findExt(name: string): AnyExt {
  const ext = createRichTextExtensions().find((e) => (e as unknown as AnyExt).name === name);
  return ext as unknown as AnyExt;
}

describe('rich-text extension schema', () => {
  it('StarterKit is configured to disable nodes not in PGW allowlist', () => {
    const sk = findExt('starterKit');
    expect(sk).toBeDefined();
    const opts = sk.config.addOptions();
    // PGW rejects these — must be disabled in StarterKit.
    expect(opts.heading).toBe(false);
    expect(opts.strike).toBe(false);
    expect(opts.code).toBe(false);
    expect(opts.blockquote).toBe(false);
    expect(opts.codeBlock).toBe(false);
    expect(opts.horizontalRule).toBe(false);
    expect(opts.link).toBe(false);
    // Underline is handled by the standalone extension below.
    expect(opts.underline).toBe(false);
  });

  it('standalone Underline extension is present', () => {
    const names = createRichTextExtensions().map((e) => (e as unknown as AnyExt).name);
    expect(names).toContain('underline');
  });

  it('TextAlign is configured for paragraph + list nodes with all four alignments', () => {
    const ta = findExt('textAlign');
    expect(ta).toBeDefined();
    const opts = ta.config.addOptions();
    expect(opts.types).toEqual(['paragraph', 'orderedList', 'bulletList']);
    expect(opts.alignments).toEqual(['left', 'center', 'right', 'justify']);
  });

  it('Link and Highlight extensions are not in the extension list', () => {
    const names = createRichTextExtensions().map((e) => (e as unknown as AnyExt).name);
    expect(names).not.toContain('link');
    expect(names).not.toContain('highlight');
  });
});
