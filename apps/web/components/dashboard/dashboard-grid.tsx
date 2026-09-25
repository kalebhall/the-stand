'use client';

import { useEffect, useMemo, useState, type DragEvent } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { type DashboardCardId, normalizeDashboardCardOrder } from '@/src/dashboard/catalog';

type DashboardCardData = {
  id: DashboardCardId;
  title: string;
  value: string;
  detail: string;
  actions?: { href: string; label: string }[];
};

export function DashboardGrid({ wardId, cards }: { wardId: string | null; cards: DashboardCardData[] }) {
  const t = useTranslations('dashboard');
  const visibleIds = useMemo(() => cards.map((card) => card.id), [cards]);
  const [order, setOrder] = useState<DashboardCardId[]>(visibleIds);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState('');
  const [draggedId, setDraggedId] = useState<DashboardCardId | null>(null);
  const [dropTargetId, setDropTargetId] = useState<DashboardCardId | null>(null);

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

  function move(id: DashboardCardId, direction: -1 | 1) {
    const index = order.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return;
    const nextOrder = [...order];
    [nextOrder[index], nextOrder[target]] = [nextOrder[target], nextOrder[index]];
    void persist(nextOrder);
  }

  function handleDragStart(event: DragEvent<HTMLElement>, id: DashboardCardId) {
    setDraggedId(id);
    setDropTargetId(null);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
  }

  function handleDrop(event: DragEvent<HTMLElement>, targetId: DashboardCardId) {
    event.preventDefault();
    const sourceId = draggedId ?? event.dataTransfer.getData('text/plain') as DashboardCardId;
    if (!sourceId || sourceId === targetId) {
      setDraggedId(null);
      setDropTargetId(null);
      return;
    }
    const sourceIndex = order.indexOf(sourceId);
    const targetIndex = order.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) {
      setDraggedId(null);
      setDropTargetId(null);
      return;
    }
    const nextOrder = [...order];
    nextOrder.splice(sourceIndex, 1);
    nextOrder.splice(targetIndex, 0, sourceId);
    setDraggedId(null);
    setDropTargetId(null);
    void persist(nextOrder);
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground" aria-live="polite">
          {status}
        </div>
        {cards.length > 1 ? (
          <div className="flex gap-2">
            <button type="button" className={cn(buttonVariants({ size: 'sm', variant: editing ? 'secondary' : 'outline' }))} onClick={() => setEditing((value) => !value)}>
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
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label={t('dashboardCards')}>
        {orderedCards.map((card, index) => (
          <article
            key={card.id}
            draggable={editing}
            onDragStart={(event) => handleDragStart(event, card.id)}
            onDragOver={(event) => {
              if (editing && draggedId !== card.id) {
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
              if (editing) handleDrop(event, card.id);
            }}
            onDragEnd={() => {
              setDraggedId(null);
              setDropTargetId(null);
            }}
            className={cn(
              'section-panel rounded-lg border bg-card p-5 text-card-foreground shadow-sm motion-safe:transition-[opacity,box-shadow] motion-safe:duration-150 motion-reduce:transition-none',
              editing && 'select-none cursor-grab active:cursor-grabbing',
              draggedId === card.id && 'opacity-50',
              dropTargetId === card.id && 'ring-2 ring-primary ring-offset-2'
            )}
            data-dashboard-card={card.id}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
                {editing ? <p className="mt-1 text-xs text-muted-foreground">{t('dragToReorder')}</p> : null}
              </div>
              {editing ? (
                <div className="flex shrink-0 gap-1">
                  <button type="button" className="rounded border px-2 py-1 text-xs" aria-label={t('moveUp', { title: card.title })} disabled={index === 0} onClick={() => move(card.id, -1)}>
                    ↑
                  </button>
                  <button type="button" className="rounded border px-2 py-1 text-xs" aria-label={t('moveDown', { title: card.title })} disabled={index === orderedCards.length - 1} onClick={() => move(card.id, 1)}>
                    ↓
                  </button>
                </div>
              ) : null}
            </div>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{card.value}</p>
            <p className="mt-2 text-sm text-muted-foreground">{card.detail}</p>
            {card.actions?.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {card.actions.map((action) => (
                  <Link key={action.href} href={action.href} className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}>
                    {action.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </>
  );
}

export type { DashboardCardData };
