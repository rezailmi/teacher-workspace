import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ReminderSection } from './ReminderSection';

const noop = vi.fn();

describe('ReminderSection', () => {
  describe('default-reminder info line', () => {
    it('renders the formatted consentByDate', () => {
      render(
        <ReminderSection value={{ type: 'NONE' }} onChange={noop} consentByDate="2026-04-23" />,
      );
      expect(screen.getByText(/default reminder will be sent on/i)).toBeInTheDocument();
      expect(screen.getByText('23 Apr 2026')).toBeInTheDocument();
    });

    it('shows "-" when consentByDate is empty', () => {
      render(<ReminderSection value={{ type: 'NONE' }} onChange={noop} consentByDate="" />);
      expect(screen.getByText(/default reminder will be sent on/i)).toBeInTheDocument();
      expect(screen.getByText('-')).toBeInTheDocument();
    });

    it('shows "-" when consentByDate is not provided', () => {
      render(<ReminderSection value={{ type: 'NONE' }} onChange={noop} />);
      expect(screen.getByText(/default reminder will be sent on/i)).toBeInTheDocument();
      expect(screen.getByText('-')).toBeInTheDocument();
    });
  });

  describe('radio options', () => {
    it('renders all three radio options', () => {
      render(<ReminderSection value={{ type: 'NONE' }} onChange={noop} />);
      expect(screen.getByText('None')).toBeInTheDocument();
      expect(screen.getByText('One-time')).toBeInTheDocument();
      expect(screen.getByText('Daily')).toBeInTheDocument();
    });
  });
});
