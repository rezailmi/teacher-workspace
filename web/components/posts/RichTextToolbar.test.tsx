import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RichTextToolbar } from './RichTextToolbar';

describe('RichTextToolbar', () => {
  it('only shows parity buttons (no H1/Strike/Link/Highlight)', () => {
    render(<RichTextToolbar editor={null} />);
    // Present
    [
      'Bold',
      'Italic',
      'Underline',
      'Align left',
      'Align center',
      'Align right',
      'Align justify',
      'Bullet list',
      'Numbered list',
    ].forEach((label) => {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    });
    // Absent
    [
      'Strikethrough',
      'Inline code',
      'Heading 1',
      'Heading 2',
      'Heading 3',
      'Quote',
      'Link',
      'Highlight',
    ].forEach((label) => {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    });
  });
});
