'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

export type ActionRow = {
  id: string;
  family: string;
  action_type: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'NOT_APPLICABLE';
  member_name: string;
  description: string;
  official_reference_url: string | null;
  due_date: string | null;
};

export function ActionsToDoClient({ wardId, initialActions }: { wardId: string; initialActions: ActionRow[] }) {
  const t = useTranslations('actionsToDo');
  const [actions, setActions] = useState(initialActions);
  const [family, setFamily] = useState('ALL');
  const [status, setStatus] = useState('OPEN');
  const [updating, setUpdating] = useState<string | null>(null);
  const visible = actions.filter((action) => (family === 'ALL' || action.family === family) && (status === 'ALL' || action.status === status));

  async function updateStatus(actionId: string, nextStatus: ActionRow['status']) {
    setUpdating(actionId);
    try {
      const response = await fetch(`/api/w/${wardId}/actions-to-do/${actionId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      if (!response.ok) return;
      const payload = (await response.json()) as { action: ActionRow };
      setActions((current) => current.map((action) => action.id === actionId ? payload.action : action));
    } finally {
      setUpdating(null);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-3 rounded-lg border bg-card p-4">
        <label className="text-sm">
          <span className="mr-2 font-medium">{t('family')}</span>
          <select className="rounded-md border px-2 py-1" value={family} onChange={(event) => setFamily(event.target.value)}>
            <option value="ALL">{t('all')}</option><option value="CALLING">{t('calling')}</option><option value="MEMBERSHIP">{t('membership')}</option><option value="PRIESTHOOD">{t('priesthood')}</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mr-2 font-medium">{t('status')}</span>
          <select className="rounded-md border px-2 py-1" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="OPEN">{t('open')}</option><option value="IN_PROGRESS">{t('inProgress')}</option><option value="COMPLETED">{t('completed')}</option><option value="NOT_APPLICABLE">{t('notApplicable')}</option><option value="ALL">{t('all')}</option>
          </select>
        </label>
      </div>

      {visible.length ? (
        <div className="grid gap-3">
          {visible.map((action) => (
            <article key={action.id} className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{t(action.family.toLowerCase())} · {t(action.status === 'IN_PROGRESS' ? 'inProgress' : action.status === 'NOT_APPLICABLE' ? 'notApplicable' : action.status.toLowerCase())}</p>
                  <h2 className="font-semibold">{action.member_name}</h2>
                  <p className="text-sm text-muted-foreground">{action.description}</p>
                  {action.due_date ? <p className="mt-1 text-xs text-muted-foreground">{t('due', { date: action.due_date })}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {action.official_reference_url ? <a className="rounded-md border px-3 py-1.5 text-sm underline" href={action.official_reference_url} target="_blank" rel="noreferrer">{t('openLcr')}</a> : null}
                  {action.status !== 'COMPLETED' && action.status !== 'NOT_APPLICABLE' ? <button className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground" disabled={updating === action.id} onClick={() => void updateStatus(action.id, 'COMPLETED')}>{t('markCompleted')}</button> : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">{t('empty')}</p>}
    </section>
  );
}
