'use client';

import { useEffect, useState } from 'react';
import type { StandRow } from '@/src/stand/render';
import { loadOfflineSnapshot, type OfflineStandSnapshot } from '@/src/offline/storage';

function OfflineRow({ row, businessLines }: { row: StandRow; businessLines: OfflineStandSnapshot['businessLines'] }) {
  if (row.kind === 'welcome') return <article className="rounded-lg border bg-card p-4 text-lg leading-relaxed">{row.text}</article>;
  if (row.kind === 'sacrament') return <article className="rounded-lg border bg-card p-4"><p className="text-sm uppercase tracking-wide text-muted-foreground">Sacrament</p><div className="mt-3 space-y-4 leading-relaxed"><section><h2 className="font-semibold">Bread prayer</h2><p>O God, the Eternal Father, we ask thee in the name of thy Son, Jesus Christ, to bless and sanctify this bread to the souls of all those who partake of it, that they may eat in remembrance of the body of thy Son, and witness unto thee, O God, the Eternal Father, that they are willing to take upon them the name of thy Son, and always remember him and keep his commandments which he has given them; that they may always have his Spirit to be with them. Amen.</p></section><section><h2 className="font-semibold">Water prayer</h2><p>O God, the Eternal Father, we ask thee in the name of thy Son, Jesus Christ, to bless and sanctify this water to the souls of all those who drink of it, that they may do it in remembrance of the blood of thy Son, which was shed for them; that they may witness unto thee, O God, the Eternal Father, that they do always remember him, that they may have his Spirit to be with them. Amen.</p></section></div></article>
  if (row.kind === 'ward_business') return <article className="rounded-lg border bg-card p-4"><p className="font-semibold">Ward and Stake Business</p><ul className="mt-2 space-y-2 text-sm">{businessLines.map((line) => <li key={line.id}>{line.memberName} — {line.callingName} ({line.actionType.toLowerCase()}, {line.status})</li>)}</ul></article>;
  if (row.kind === 'standard') return <article className="rounded-lg border bg-card p-4"><p className="text-sm uppercase tracking-wide text-muted-foreground">{row.label}</p><p className="mt-1 whitespace-pre-wrap text-lg font-medium">{row.details}</p>{row.programNotes?.trim() ? <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{row.programNotes}</p> : null}</article>;
  return <article className="rounded-lg border bg-card p-4"><p className="text-sm uppercase tracking-wide text-muted-foreground">{row.kind === 'sustain' ? 'Sustain' : 'Release'}</p><p className="text-lg leading-relaxed">{row.segments.map((segment, index) => segment.bold ? <strong key={index}>{segment.text}</strong> : <span key={index}>{segment.text}</span>)}</p>{row.programNotes?.trim() ? <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{row.programNotes}</p> : null}</article>;
}

export default function OfflineStandPage({ meetingId }: { meetingId: string }) {
  const [snapshot, setSnapshot] = useState<OfflineStandSnapshot | null>(null);
  const [mode, setMode] = useState<'formal' | 'compact'>('formal');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadOfflineSnapshot(meetingId).then(setSnapshot).catch(() => setError('Unable to open offline copy.'));
  }, [meetingId]);

  if (error) return <main className="mx-auto max-w-3xl p-6"><p className="text-destructive">{error}</p></main>;
  if (!snapshot) return <main className="mx-auto max-w-3xl p-6"><p>Loading offline copy…</p></main>;

  const rows = (snapshot.standRows as unknown as StandRow[]).map((row) => mode === 'compact' && (row.kind === 'sustain' || row.kind === 'release') ? { ...row, segments: [{ text: row.summary, bold: false }] } : row);
  return <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
    <section className="rounded-lg border bg-card p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Offline copy</p><h1 className="text-2xl font-semibold">At the Stand</h1><p className="text-sm text-muted-foreground">{snapshot.meeting.meetingDate} · {snapshot.meeting.meetingType}</p><p className="mt-2 text-xs text-muted-foreground">Saved {new Date(snapshot.savedAt).toLocaleString()}</p><div className="mt-3 flex gap-2"><button className="rounded-md border px-3 py-1 text-sm" onClick={() => setMode('formal')}>Formal Script</button><button className="rounded-md border px-3 py-1 text-sm" onClick={() => setMode('compact')}>Compact Labels</button></div></section>
    <section className="grid gap-3">{rows.map((row, index) => <OfflineRow key={index} row={row} businessLines={snapshot.businessLines} />)}</section>
  </main>;
}
