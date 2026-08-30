// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WardBusinessSection } from './WardBusinessSection';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() })
}));

const baseLine = {
  id: 'line-1',
  member_name: 'Sister Jane Smith',
  calling_name: 'Relief Society President',
  action_type: 'SUSTAIN' as const
};

describe('WardBusinessSection', () => {
  afterEach(() => cleanup());

  it('opens while business remains pending', () => {
    const lines = [{ ...baseLine, status: 'pending' as const }];
    render(<WardBusinessSection wardId="ward-1" meetingId="meeting-1" lines={lines} canManage={false} collapsible={true} />);

    expect(screen.getByText('1 pending')).toBeVisible();
    expect(screen.getByText('Sister Jane Smith')).toBeVisible();
    expect(screen.getByText('Ward and Stake Business').closest('details')).toHaveAttribute('open');
  });

  it('collapses after all business is announced', () => {
    const lines = [{ ...baseLine, status: 'announced' as const }];
    render(<WardBusinessSection wardId="ward-1" meetingId="meeting-1" lines={lines} canManage={false} collapsible={true} />);

    expect(screen.getByText('1 announced')).toBeVisible();
    expect(screen.getByText('Ward and Stake Business').closest('details')).not.toHaveAttribute('open');
  });
});
