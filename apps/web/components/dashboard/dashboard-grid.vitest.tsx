// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DashboardGrid, type DashboardCardData } from './dashboard-grid';

const cards: DashboardCardData[] = [
  { id: 'next-meeting', title: 'Next meeting', value: 'Sunday', detail: 'Upcoming' },
  { id: 'draft-count', title: 'Drafts', value: '2', detail: 'Needs review' },
  { id: 'last-import', title: 'Last import', value: 'Members', detail: 'Recent' }
];

describe('DashboardGrid', () => {
  afterEach(() => cleanup());

  it('moves cards with accessible controls', () => {
    render(<DashboardGrid wardId={null} cards={cards} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit dashboard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Next meeting down' }));

    const renderedIds = [...document.querySelectorAll('[data-dashboard-card]')].map((element) => element.getAttribute('data-dashboard-card'));
    expect(renderedIds).toEqual(['draft-count', 'next-meeting', 'last-import']);
  });

  it('resets the local order without a ward request', () => {
    render(<DashboardGrid wardId={null} cards={cards} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit dashboard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Next meeting down' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset order' }));

    const renderedIds = [...document.querySelectorAll('[data-dashboard-card]')].map((element) => element.getAttribute('data-dashboard-card'));
    expect(renderedIds).toEqual(['next-meeting', 'draft-count', 'last-import']);
  });

  it('supports pointer drag-and-drop while retaining the keyboard controls', () => {
    render(<DashboardGrid wardId={null} cards={cards} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit dashboard' }));
    const source = document.querySelector('[data-dashboard-card="next-meeting"]');
    const target = document.querySelector('[data-dashboard-card="last-import"]');
    expect(source).not.toBeNull();
    expect(target).not.toBeNull();
    if (!source || !target) throw new Error('dashboard cards not rendered');
    const dataTransfer = {
      effectAllowed: '',
      setData: () => undefined,
      getData: () => 'next-meeting'
    };
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    expect(target).toHaveClass('ring-2');
    fireEvent.drop(target, { dataTransfer });

    const renderedIds = [...document.querySelectorAll('[data-dashboard-card]')].map((element) => element.getAttribute('data-dashboard-card'));
    expect(renderedIds).toEqual(['draft-count', 'last-import', 'next-meeting']);
  });
});
