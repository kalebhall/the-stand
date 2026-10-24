'use client';

import { useEffect, useMemo, useState, type DragEvent } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { type DashboardCardId, normalizeDashboardCardOrder } from '@/src/dashboard/catalog';

export type DashboardCardBreakdown = {
  label: string;
  value: string;
  href: string;
};

export type DashboardCardAction = {
  href: string;
  label: string;
};

type SecondaryDashboardCardId = Exclude<DashboardCardId, 'next-meeting'>;

type DashboardCardData =
  | {
      kind: 'metric';
      id: DashboardCardId;
      title: string;
      value: string;
      detail: string;
      actions?: DashboardCardAction[];
    }
  | {
      kind: 'breakdown';
      id: DashboardCardId;
      title: string;
      rows: DashboardCardBreakdown[];
    };

export function DashboardGrid({ wardId, cards }: { wardId: string | null; cards: DashboardCardData[] }) {
  const t = useTranslations('dashboard');
  const visibleIds = useMemo(() => cards.map((card) => card.id), [cards]);
  const [order, setOrder] = useState<DashboardCardId[]>(visibleIds);
  const [editing, setEditing] = useState(false);
  const [secondaryExpanded, setSecondaryExpanded] = useState(false);
  const [status, setStatus] = useState('');
  const [draggedId, setDraggedId] = useState<SecondaryDashboardCardId | null>(null);
  const [dropTargetId, setDropTargetId] = useState<SecondaryDashboardCardId | null>(null);

  function isSecondaryCardId(id: string): id is SecondaryDashboardCardId {
    return id !== 'next-meeting' && cards.some((card) => card.id === id);
  }

  useEffect(() => {
    if (!wardId) return;
    let cancelled = false;
    void fetch(`/api/w/${wardId}/dashboard-preferences`, { cache: 'no-store' })
      .then((response) => (response.ok ? (response.json() as Promise<{ cardOrder?: unknown }>) : null))
      .then((body) => {
        if (cancelled) return;
        const saved = normalizeDashboardCardOrder(body?.cardOrder, visibleIds);
        if (!cancelled && saved) setOrder(saved);
      })
      .catch(() => {
        if (!cancelled) setStatus(t('dashboardLoadFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [wardId, visibleIds]);

  const cardsById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
  const orderedCards = order.map((id) => cardsById.get(id)).filter((card): card is DashboardCardData => Boolean(card));
  const meetingCard = orderedCards.find((card) => card.id === 'next-meeting');
  const secondaryCards = orderedCards.filter((card) => card.id !== 'next-meeting');

  async function persist(nextOrder: DashboardCardId[]) {
    setOrder(nextOrder);
    setStatus(t('savingOrder'));
    try {
      const response = await fetch(`/api/w/${wardId}/dashboard-preferences`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cardOrder: nextOrder })
      });
      if (!response.ok) throw new Error('save failed');
      setStatus(t('orderSaved'));
    } catch {
      setStatus(t('saveOrderFailed'));
    }
  }

  async function reset() {
    if (!wardId) {
      setOrder(visibleIds);
      setStatus(t('orderReset'));
      return;
    }
    setStatus(t('resettingOrder'));
    try {
      const response = await fetch(`/api/w/${wardId}/dashboard-preferences`, { method: 'DELETE' });
      if (!response.ok) throw new Error('reset failed');
      setOrder(visibleIds);
      setStatus(t('orderReset'));
    } catch {
      setStatus(t('resetOrderFailed'));
    }
  }

  function combineSecondaryOrder(secondaryOrder: SecondaryDashboardCardId[]): DashboardCardId[] {
    return visibleIds.includes('next-meeting') ? ['next-meeting', ...secondaryOrder] : secondaryOrder;
  }

  function move(id: DashboardCardId, direction: -1 | 1) {
    if (!isSecondaryCardId(id)) return;
    const secondaryOrder = order.filter(isSecondaryCardId);
    const index = secondaryOrder.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= secondaryOrder.length) return;
    [secondaryOrder[index], secondaryOrder[target]] = [secondaryOrder[target], secondaryOrder[index]];
    void persist(combineSecondaryOrder(secondaryOrder));
  }

  function handleDragStart(event: DragEvent<HTMLElement>, id: SecondaryDashboardCardId) {
    setDraggedId(id);
    setDropTargetId(null);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
  }

  function handleDrop(event: DragEvent<HTMLElement>, targetId: DashboardCardId) {
    event.preventDefault();
    if (!isSecondaryCardId(targetId)) {
      setDraggedId(null);
      setDropTargetId(null);
      return;
    }
    const sourceId = draggedId ?? event.dataTransfer.getData('text/plain');
    if (!isSecondaryCardId(sourceId) || sourceId === targetId) {
      setDraggedId(null);
      setDropTargetId(null);
      return;
    }
    const secondaryOrder = order.filter(isSecondaryCardId);
    const sourceIndex = secondaryOrder.indexOf(sourceId);
    const targetIndex = secondaryOrder.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) {
      setDraggedId(null);
      setDropTargetId(null);
      return;
    }
    secondaryOrder.splice(sourceIndex, 1);
    secondaryOrder.splice(targetIndex, 0, sourceId);
    setDraggedId(null);
    setDropTargetId(null);
    void persist(combineSecondaryOrder(secondaryOrder));
  }

  const renderCard = (card: DashboardCardData, index: number, pinned = false) => (
    <article
      key={card.id}
      draggable={editing && !pinned}
      onDragStart={(event) => {
        if (isSecondaryCardId(card.id)) handleDragStart(event, card.id);
      }}
      onDragOver={(event) => {
        if (editing && !pinned && isSecondaryCardId(card.id) && draggedId !== card.id) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          setDropTargetId(card.id);
        }
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setDropTargetId((current) => (current === card.id ? null : current));
      }}
      onDrop={(event) => {
        if (editing && !pinned && isSecondaryCardId(card.id)) handleDrop(event, card.id);
      }}
      onDragEnd={() => {
        setDraggedId(null);
        setDropTargetId(null);
      }}
      className={cn(
        'section-panel rounded-lg border bg-card p-5 text-card-foreground shadow-sm motion-safe:transition-[opacity,box-shadow] motion-safe:duration-150 motion-reduce:transition-none',
        editing && !pinned && 'select-none cursor-grab active:cursor-grabbing',
        draggedId === card.id && 'opacity-50',
        dropTargetId === card.id && 'ring-2 ring-primary ring-offset-2'
      )}
      data-dashboard-card={card.id}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
          {editing && !pinned ? <p className="mt-1 text-xs text-muted-foreground">{t('dragToReorder')}</p> : null}
        </div>
        {editing && !pinned && isSecondaryCardId(card.id) ? (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              className="rounded border px-2 py-1 text-xs"
              aria-label={t('moveUp', { title: card.title })}
              disabled={index === 0}
              onClick={() => move(card.id, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="rounded border px-2 py-1 text-xs"
              aria-label={t('moveDown', { title: card.title })}
              disabled={index === secondaryCards.length - 1}
              onClick={() => move(card.id, 1)}
            >
              ↓
            </button>
          </div>
        ) : null}
      </div>
      {card.kind === 'metric' ? (
        <>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{card.value}</p>
          <p className="mt-2 text-sm text-muted-foreground">{card.detail}</p>
          {card.actions?.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {card.actions.map((action, actionIndex) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className={cn(
                    buttonVariants({
                      size: 'sm',
                      variant: card.id === 'next-meeting' && actionIndex === 0 ? 'default' : 'outline'
                    })
                  )}
                >
                  {action.label}
                </Link>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <ul className="mt-3 divide-y rounded-md border">
          {card.rows.map((row) => (
            <li key={row.href}>
              <Link
                href={row.href}
                aria-label={`${row.label}: ${row.value}`}
                className="flex min-h-11 items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              >
                <span>{row.label}</span>
                <span className="shrink-0 font-medium tabular-nums">{row.value}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </article>
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground" aria-live="polite">
          {status}
        </div>
        {cards.length > 1 ? (
          <div className="flex gap-2">
            <button
              type="button"
              className={cn(buttonVariants({ size: 'sm', variant: editing ? 'secondary' : 'outline' }))}
              onClick={() => setEditing((value) => !value)}
            >
              {editing ? t('doneEditing') : t('editDashboard')}
            </button>
            {editing ? (
              <button type="button" className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))} onClick={() => void reset()}>
                {t('resetOrder')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {meetingCard ? (
        <section className="mb-4" aria-label={meetingCard.title}>
          {renderCard(meetingCard, 0, true)}
        </section>
      ) : null}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label={t('dashboardCards')}>
        {secondaryCards.slice(0, 3).map((card, index) => renderCard(card, index))}
      </section>
      {secondaryCards.length > 3 ? (
        <details
          className="rounded-lg border bg-card px-4"
          open={editing || secondaryExpanded}
          onToggle={(event) => setSecondaryExpanded(event.currentTarget.open)}
        >
          <summary className="cursor-pointer py-3 text-sm font-medium marker:text-muted-foreground">{t('moreWardWork')}</summary>
          <section className="grid gap-4 pb-4 md:grid-cols-2 xl:grid-cols-3" aria-label={t('moreWardWork')}>
            {secondaryCards.slice(3).map((card, index) => renderCard(card, index + 3))}
          </section>
        </details>
      ) : null}
    </>
  );
}

export type { DashboardCardData };
