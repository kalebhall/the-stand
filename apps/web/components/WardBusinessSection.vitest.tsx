// @vitest-environment jsdom

import React from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MESSAGE_CATALOGS } from '@/src/i18n/messages';
const messages = MESSAGE_CATALOGS['en-US'];

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

const renderSection = (children: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en-US" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );

describe('WardBusinessSection', () => {
  afterEach(() => cleanup());

  it('opens while business remains pending', () => {
    const lines = [{ ...baseLine, status: 'pending' as const }];
    renderSection(<WardBusinessSection wardId="ward-1" meetingId="meeting-1" lines={lines} canManage={false} collapsible={true} />);

    expect(screen.getByText('1 pending')).toBeVisible();
    expect(screen.getByText('Sister Jane Smith')).toBeVisible();
    expect(screen.getByText('Ward and Stake Business').closest('details')).toHaveAttribute('open');
  });

  it('collapses after all business is announced', () => {
    const lines = [{ ...baseLine, status: 'announced' as const }];
    renderSection(<WardBusinessSection wardId="ward-1" meetingId="meeting-1" lines={lines} canManage={false} collapsible={true} />);

    expect(screen.getByText('1 announced')).toBeVisible();
    expect(screen.getByText('Ward and Stake Business').closest('details')).not.toHaveAttribute('open');
  });

  it('labels carried-forward business items', () => {
    renderSection(
      <WardBusinessSection
        wardId="ward-1"
        meetingId="meeting-2"
        lines={[{ ...baseLine, status: 'pending' as const, carried_forward: true }]}
        canManage={false}
      />
    );

    expect(screen.getByText(/Carried forward/)).toBeVisible();
  });

  it('keeps membership and ordinance items inside ward and stake business without edit controls', () => {
    renderSection(
      <WardBusinessSection
        wardId="ward-1"
        meetingId="meeting-1"
        lines={[]}
        membershipActions={[{ id: 'action-1', member_name: 'Brother John Smith', action_type: 'BABY_BLESSING', status: 'pending' }]}
        canManage={true}
      />
    );

    expect(screen.getByText('Ward and Stake Business')).toBeVisible();
    expect(screen.getByText('Baby blessing')).toBeVisible();
    expect(screen.getByText('Brother John Smith')).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
