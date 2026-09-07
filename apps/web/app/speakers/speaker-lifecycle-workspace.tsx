'use client';

import { useState } from 'react';
import { SPEAKER_STATUSES, type SpeakerStatus } from '@/src/meetings/types';

type Speaker = { id: string; meetingId: string; meetingLabel: string; speakerName: string; topic: string; status: SpeakerStatus };

export function SpeakerLifecycleWorkspace({ wardId, speakers }: { wardId: string; speakers: Speaker[] }) {
  const [rows, setRows] = useState(speakers);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(speaker: Speaker) {
    setBusy(speaker.id);
    setError(null);
    const response = await fetch(`/api/w/${wardId}/speakers/${speaker.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topic: speaker.topic, speakerStatus: speaker.status })
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? 'Unable to update speaker.');
    }
    setBusy(null);
  }

  return (
    <div className="space-y-3">
      {error ? <p className="rounded-md border border-destructive p-3 text-sm text-destructive" role="alert">{error}</p> : null}
      {rows.length ? rows.map((speaker, index) => {
        const currentIndex = SPEAKER_STATUSES.indexOf(speaker.status);
        const allowedStatuses = SPEAKER_STATUSES.slice(0, Math.min(currentIndex + 2, SPEAKER_STATUSES.length));
        return (
          <article key={speaker.id} className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{speaker.meetingLabel}</p>
                <h2 className="text-lg font-semibold">{speaker.speakerName || `Speaker ${index + 1}`}</h2>
              </div>
              <span className="rounded-full border px-2.5 py-1 text-xs font-medium">{speaker.status}</span>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_14rem_auto]">
              <label className="space-y-1 text-sm">
                <span className="font-medium">Speaking topic</span>
                <input className="w-full rounded-md border px-3 py-2" value={speaker.topic} onChange={(event) => setRows((current) => current.map((row) => row.id === speaker.id ? { ...row, topic: event.target.value } : row))} placeholder="What will this speaker speak on?" />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Lifecycle status</span>
                <select className="w-full rounded-md border px-3 py-2" value={speaker.status} onChange={(event) => setRows((current) => current.map((row) => row.id === speaker.id ? { ...row, status: event.target.value as SpeakerStatus } : row))}>
                  {allowedStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
              <button type="button" className="self-end rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50" disabled={busy === speaker.id} onClick={() => void save(speaker)}>{busy === speaker.id ? 'Saving…' : 'Save'}</button>
            </div>
            {speaker.status === 'ACCEPTED' && !speaker.topic.trim() ? <p className="mt-2 text-xs text-amber-700">Topic required before confirmation.</p> : null}
          </article>
        );
      }) : <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No speakers assigned to meetings.</p>}
    </div>
  );
}
