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

  it('renders stake business with the meeting-form and offline translation namespaces', () => {
    renderSection(
      <WardBusinessSection
        wardId="ward-1"
        meetingId="meeting-1"
        lines={[]}
        canManage={false}
        includesStakeBusiness={true}
        stakeBusinessParticipantName="President Lee"
        stakeBusinessParticipantCalling="Stake President"
      />
    );

    expect(screen.getByText('Stake business is included in this meeting.')).toBeVisible();
    expect(screen.getByText('President Lee').closest('p')).toHaveTextContent(
      'At this time, we will turn the meeting over to President Lee, Stake President for stake business.'
    );
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
        membershipTemplates={{ BABY_BLESSING: 'Bless {memberName}.' }}
        canManage={true}
        showScript={false}
      />
    );

    expect(screen.getByText('Ward and Stake Business')).toBeVisible();
    expect(screen.getByText('Baby blessing')).toBeVisible();
    expect(screen.getByText('Brother John Smith')).toBeVisible();
    expect(screen.queryByText('Bless Brother John Smith.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders membership and priesthood scripts from ward templates in formal Stand mode', () => {
    const { container } = renderSection(
      <WardBusinessSection
        wardId="ward-1"
        meetingId="meeting-1"
        lines={[]}
        membershipActions={[
          { id: 'welcome', member_name: 'Jordan Lee', action_type: 'WELCOME_NEW_MEMBER', status: 'pending' },
          { id: 'baptized-child', member_name: 'Toni Young', action_type: 'RECOGNIZE_BAPTIZED_CHILD', status: 'pending' },
          { id: 'baby-blessing', member_name: 'Riley Hall', action_type: 'BABY_BLESSING', status: 'pending' },
          {
            id: 'ordination',
            member_name: 'Casey Rivera',
            action_type: 'PRIESTHOOD_ORDINATION',
            priesthood_office: 'PRIEST',
            status: 'pending'
          },
          {
            id: 'advancement',
            member_name: 'Morgan Reed',
            action_type: 'PRIESTHOOD_ADVANCEMENT',
            priesthood_office: 'ELDER',
            status: 'pending'
          }
        ]}
        membershipTemplates={{
          WELCOME_NEW_MEMBER: 'We welcome **{memberName}** to our ward.',
          RECOGNIZE_BAPTIZED_CHILD: 'We recognize {memberName}.',
          BABY_BLESSING: 'We bless {memberName}.',
          PRIESTHOOD_ORDINATION: 'It is proposed that **{memberName}** be ordained to **{callingName}**.',
          PRIESTHOOD_ADVANCEMENT: 'It is proposed that {memberName} advance to {callingName}.'
        }}
        canManage={false}
        showScript={true}
        collapsible={true}
      />
    );

    expect(container).toHaveTextContent('We welcome Jordan Lee to our ward.');
    expect(container).toHaveTextContent('We recognize Toni Young.');
    expect(container).toHaveTextContent('We bless Riley Hall.');
    expect(container).toHaveTextContent('It is proposed that Casey Rivera be ordained to Priest.');
    expect(container).toHaveTextContent('It is proposed that Morgan Reed advance to Elder.');
    expect(screen.getByText('Ward and Stake Business').closest('details')).toHaveAttribute('open');
    expect(screen.getByText('5 pending')).toBeVisible();
    const boldScriptValues = Array.from(container.querySelectorAll('strong')).map((item) => item.textContent);
    expect(boldScriptValues).toContain('Jordan Lee');
    expect(boldScriptValues).toContain('Casey Rivera');
  });

  it('keeps completed membership scripts visible without an announced-count summary', () => {
    renderSection(
      <WardBusinessSection
        wardId="ward-1"
        meetingId="meeting-1"
        lines={[]}
        membershipActions={[{ id: 'completed-welcome', member_name: 'Jordan Lee', action_type: 'WELCOME_NEW_MEMBER', status: 'completed' }]}
        membershipTemplates={{ WELCOME_NEW_MEMBER: 'Completed script: {memberName}.' }}
        canManage={false}
        showScript={true}
        collapsible={true}
      />
    );

    const section = screen.getByText('Ward and Stake Business').closest('details');
    expect(section).toHaveAttribute('open');
    expect(section?.querySelector('summary')).toHaveTextContent('Membership and ordinance follow-up');
    expect(section).toHaveTextContent('Completed script: Jordan Lee.');
    expect(section).not.toHaveTextContent('0 announced');
  });
});
