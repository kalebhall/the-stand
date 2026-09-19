'use client';

import { useEffect, useState } from 'react';

type QueueItem = {
  id: string;
  sourceType: string;
  sourceId: string;
  status: 'UNASSIGNED' | 'ASSIGNED' | 'IN_PROGRESS' | 'WAITING' | 'RESOLVED' | 'CLOSED';
  assignedToUserId: string | null;
  assignedToEmail: string | null;
  createdAt: string;
  updatedAt: string;
};

type Assignee = { id: string; email: string };

const statuses: QueueItem['status'][] = ['UNASSIGNED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'];

type QueueResponse = { items: QueueItem[]; assignees: Assignee[] };

export function SupportQueueClient() {
  const [data, setData] = useState<QueueResponse>({ items: [], assignees: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/support/queue', { cache: 'no-store' });
      const body = (await response.json()) as QueueResponse & { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Unable to load support queue.');
      setData(body);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load support queue.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function update(item: QueueItem, operation: 'CLAIM' | 'ASSIGN' | 'STATUS', values: Record<string, unknown> = {}) {
    setSavingId(item.id);
    setError(null);
    try {
      const response = await fetch('/api/support/queue', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: item.id, operation, expectedUpdatedAt: item.updatedAt, ...values })
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Unable to update queue item.');
      await load();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update queue item.');
    } finally {
      setSavingId(null);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading support queue…</p>;

  return (
    <section className="space-y-4">
      {error ? <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</p> : null}
      {data.items.length === 0 ? <p className="text-sm text-muted-foreground">No support work items.</p> : null}
      <div className="space-y-3">
        {data.items.map((item) => (
          <article key={item.id} className="rounded-lg border bg-card p-4 text-card-foreground">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{item.sourceType.replaceAll('_', ' ')}</p>
                <p className="text-xs text-muted-foreground">Source: {item.sourceId}</p>
                <p className="mt-1 text-sm">Assigned: {item.assignedToEmail ?? 'Unassigned'}</p>
              </div>
              <span className="rounded-full border px-2 py-1 text-xs font-medium">{item.status}</span>
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-2">
              {item.status === 'UNASSIGNED' ? (
                <button className="rounded-md border px-3 py-2 text-sm font-medium" disabled={savingId === item.id} onClick={() => void update(item, 'CLAIM')}>
                  Claim
                </button>
              ) : null}
              <label className="flex flex-col gap-1 text-xs font-medium">
                Assign to
                <select
                  className="rounded-md border bg-background px-2 py-2 text-sm"
                  value={item.assignedToUserId ?? ''}
                  disabled={savingId === item.id}
                  onChange={(event) => void update(item, 'ASSIGN', { assignedToUserId: event.target.value || null })}
                >
                  <option value="">Unassigned</option>
                  {data.assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.email}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium">
                Status
                <select
                  className="rounded-md border bg-background px-2 py-2 text-sm"
                  value={item.status}
                  disabled={savingId === item.id}
                  onChange={(event) => void update(item, 'STATUS', { status: event.target.value })}
                >
                  {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
