// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';

import { DashboardGrid, type DashboardCardData } from './dashboard-grid';
import { MESSAGE_CATALOGS } from '@/src/i18n/messages';

const membershipBreakdown = [
  { label: 'Membership actions', value: '1 waiting', href: '/membership-ordinances?status=action_needed&queue=needs_attention' },
  {
    label: 'Priesthood preparation',
    value: '2 waiting',
    href: '/membership-ordinances?action=PRIESTHOOD_ORDINATION&queue=needs_attention'
  },
  { label: 'Interview follow-up', value: '3 waiting', href: '/membership-ordinances?followup=interview&queue=needs_attention' },
  { label: 'Overdue actions', value: '4 overdue', href: '/membership-ordinances?followup=overdue&queue=needs_attention' },
  { label: 'LCR follow-up', value: '5 waiting', href: '/membership-ordinances?followup=lcr&queue=needs_attention' },
  { label: 'Official handoff', value: '6 waiting', href: '/membership-ordinances?followup=official-record&queue=needs_attention' }
];

const cards: DashboardCardData[] = [
  {
    kind: 'metric',
    id: 'next-meeting',
    title: 'Next meeting',
    value: 'Sunday',
    detail: 'Upcoming',
    actions: [
      { href: '/stand/meeting-1', label: 'At the Stand' },
      { href: '/meetings/meeting-1/edit', label: 'Edit' },
      { href: '/meetings/meeting-1/print', label: 'Print' }
    ]
  },
  { kind: 'metric', id: 'draft-count', title: 'Drafts', value: '2', detail: 'Needs review' },
  { kind: 'metric', id: 'last-import', title: 'Last import', value: 'Members', detail: 'Recent' },
  { kind: 'breakdown', id: 'membership-follow-up', title: 'Membership work', rows: membershipBreakdown },
  { kind: 'metric', id: 'actions-to-do', title: 'Actions', value: '3', detail: 'Open actions' }
];

describe('DashboardGrid', () => {
  function renderGrid(cardsToRender: DashboardCardData[] = cards) {
    return render(
      <NextIntlClientProvider locale="en-US" messages={MESSAGE_CATALOGS['en-US']}>
        <DashboardGrid wardId={null} cards={cardsToRender} />
      </NextIntlClientProvider>
    );
  }

  afterEach(() => cleanup());

  it('keeps the next meeting above reorderable cards regardless of the incoming order', () => {
    renderGrid([cards[1], cards[2], cards[0], cards[3]]);

    const renderedIds = [...document.querySelectorAll('[data-dashboard-card]')].map((element) =>
      element.getAttribute('data-dashboard-card')
    );
    expect(renderedIds[0]).toBe('next-meeting');
    expect(screen.getByRole('link', { name: 'At the Stand' })).toHaveAttribute('href', '/stand/meeting-1');
    expect(screen.getByRole('link', { name: 'At the Stand' })).toHaveClass('bg-primary');
    expect(screen.queryByRole('button', { name: 'Move Next meeting up' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move Next meeting down' })).not.toBeInTheDocument();
  });

  it('keeps every membership queue count and its existing filtered destination in one card', () => {
    renderGrid();

    const membershipCard = document.querySelector('[data-dashboard-card="membership-follow-up"]');
    expect(membershipCard).not.toBeNull();
    for (const row of membershipBreakdown) {
      const link = screen.getByRole('link', { name: `${row.label}: ${row.value}` });
      expect(link).toHaveAttribute('href', row.href);
      expect(membershipCard).toContainElement(link);
    }
  });

  it('keeps the first three secondary cards in view and opens remaining work while editing', () => {
    renderGrid();

    const disclosure = document.querySelector('details');
    expect(disclosure?.open).toBe(false);
    expect(disclosure?.querySelector('[data-dashboard-card="actions-to-do"]')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Edit dashboard' }));

    expect(disclosure?.open).toBe(true);
  });

  it('moves secondary cards with accessible controls but leaves the meeting focus fixed', () => {
    renderGrid();

    fireEvent.click(screen.getByRole('button', { name: 'Edit dashboard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Drafts down' }));

    const renderedIds = [...document.querySelectorAll('[data-dashboard-card]')].map((element) =>
      element.getAttribute('data-dashboard-card')
    );
    expect(renderedIds).toEqual(['next-meeting', 'last-import', 'draft-count', 'membership-follow-up', 'actions-to-do']);
  });

  it('resets secondary card order without moving the meeting focus', () => {
    renderGrid();

    fireEvent.click(screen.getByRole('button', { name: 'Edit dashboard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Drafts down' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset order' }));

    const renderedIds = [...document.querySelectorAll('[data-dashboard-card]')].map((element) =>
      element.getAttribute('data-dashboard-card')
    );
    expect(renderedIds).toEqual(['next-meeting', 'draft-count', 'last-import', 'membership-follow-up', 'actions-to-do']);
  });

  it('supports secondary-card drag-and-drop while retaining the keyboard controls', () => {
    renderGrid();

    fireEvent.click(screen.getByRole('button', { name: 'Edit dashboard' }));
    const source = document.querySelector('[data-dashboard-card="draft-count"]');
    const target = document.querySelector('[data-dashboard-card="membership-follow-up"]');
    expect(source).not.toBeNull();
    expect(target).not.toBeNull();
    if (!source || !target) throw new Error('dashboard cards not rendered');
    const dataTransfer = {
      effectAllowed: '',
      setData: () => undefined,
      getData: () => 'draft-count'
    };
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    expect(target).toHaveClass('ring-2');
    fireEvent.drop(target, { dataTransfer });

    const renderedIds = [...document.querySelectorAll('[data-dashboard-card]')].map((element) =>
      element.getAttribute('data-dashboard-card')
    );
    expect(renderedIds).toEqual(['next-meeting', 'last-import', 'membership-follow-up', 'draft-count', 'actions-to-do']);
  });
});
