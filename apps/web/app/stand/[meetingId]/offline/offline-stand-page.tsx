'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StandRow } from '@/src/stand/render';
import {
  loadOfflineSnapshot, queueOfflineMutation, listOfflineMutations, removeOfflineMutation,
  saveOfflineSnapshot, type OfflineMutation, type OfflineNote, type OfflineStandSnapshot
} from '@/src/offline/storage';

function OfflineRow({ row, done, onToggle }: { row: StandRow; done: boolean; onToggle: () => void }) {
  const programNotes = 'programNotes' in row ? row.programNotes : null;
  const content = row.kind === 'welcome' ? <p className="text-lg leading-relaxed">{row.text}</p>
    : row.kind === 'sacrament' ? <><p className="text-sm uppercase tracking-wide text-muted-foreground">Sacrament</p><div className="mt-3 space-y-4 leading-relaxed"><section><h2 className="font-semibold">Bread prayer</h2><p>O God, the Eternal Father, we ask thee in the name of thy Son, Jesus Christ, to bless and sanctify this bread to the souls of all those who partake of it, that they may eat in remembrance of the body of thy Son, and witness unto thee, O God, the Eternal Father, that they are willing to take upon them the name of thy Son, and always remember him and keep his commandments which he has given them; that they may always have his Spirit to be with them. Amen.</p></section><section><h2 className="font-semibold">Water prayer</h2><p>O God, the Eternal Father, we ask thee in the name of thy Son, Jesus Christ, to bless and sanctify this water to the souls of all those who drink of it, that they may do it in remembrance of the blood of thy Son, which was shed for them; that they may witness unto thee, O God, the Eternal Father, that they do always remember him, that they may have his Spirit to be with them. Amen.</p></section></div></>
    : row.kind === 'ward_business' ? <><p className="font-semibold">Ward and Stake Business</p><p className="mt-2 text-sm">Use connected copy for business actions.</p></>
    : row.kind === 'standard' ? <><p className="text-sm uppercase tracking-wide text-muted-foreground">{row.label}</p><p className="mt-1 whitespace-pre-wrap text-lg font-medium">{row.details}</p></>
    : <><p className="text-sm uppercase tracking-wide text-muted-foreground">{row.kind === 'sustain' ? 'Sustain' : 'Release'}</p><p className="text-lg leading-relaxed">{row.segments.map((segment, index) => segment.bold ? <strong key={index}>{segment.text}</strong> : <span key={index}>{segment.text}</span>)}</p></>;
  return <article className={`rounded-lg border bg-card p-4 ${done ? 'opacity-60' : ''}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1">{content}{programNotes?.trim() ? <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{programNotes}</p> : null}</div><button type="button" className="shrink-0 rounded-md border px-2 py-1 text-xs" onClick={onToggle}>{done ? 'Completed' : 'Mark complete'}</button></div></article>;
}

export default function OfflineStandPage({ meetingId }: { meetingId: string }) {
  const [snapshot, setSnapshot] = useState<OfflineStandSnapshot | null>(null);
  const [mode, setMode] = useState<'formal' | 'compact'>('formal');
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [pending, setPending] = useState(0);
  const [noteText, setNoteText] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const persist = useCallback(async (next: OfflineStandSnapshot) => { setSnapshot(next); await saveOfflineSnapshot(next); }, []);
  const refreshPending = useCallback(async () => setPending((await listOfflineMutations()).filter((item) => item.meetingId === meetingId).length), [meetingId]);
  const sync = useCallback(async () => {
    if (!navigator.onLine || syncing) return;
    const mutations = (await listOfflineMutations()).filter((item) => item.meetingId === meetingId);
    if (!mutations.length) { setPending(0); return; }
    setSyncing(true);
    try {
      const response = await fetch(`/api/w/${snapshot?.wardId}/meetings/${meetingId}/offline-sync`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mutations }) });
      if (!response.ok) throw new Error('Sync failed');
      const payload = await response.json() as { results: Array<{ mutationId: string; status: string; noteId?: string }> };
      for (const result of payload.results) if (result.status === 'applied' || result.status === 'duplicate') await removeOfflineMutation(result.mutationId);
      const remaining = await listOfflineMutations();
      if (!remaining.some((item) => item.meetingId === meetingId) && snapshot) {
        const next = { ...snapshot, notes: snapshot.notes?.map((note) => ({ ...note, pending: false })) };
        setSnapshot(next); await saveOfflineSnapshot(next);
      }
      await refreshPending();
    } catch { setError('Changes waiting to sync.'); } finally { setSyncing(false); }
  }, [meetingId, refreshPending, snapshot?.wardId, syncing]);

  useEffect(() => { void loadOfflineSnapshot(meetingId).then(async (value) => { setSnapshot(value); await refreshPending(); }).catch(() => setError('Unable to open offline copy.')); }, [meetingId, refreshPending]);
  useEffect(() => { const run = () => void sync(); window.addEventListener('online', run); document.addEventListener('visibilitychange', run); return () => { window.removeEventListener('online', run); document.removeEventListener('visibilitychange', run); }; }, [sync]);

  const rows = useMemo(() => (snapshot?.standRows as unknown as StandRow[] | undefined)?.map((row) => mode === 'compact' && (row.kind === 'sustain' || row.kind === 'release') ? { ...row, segments: [{ text: row.summary, bold: false }] } : row) ?? [], [mode, snapshot]);
  async function addNote() {
    if (!snapshot || !noteText.trim()) return;
    const note: OfflineNote = { id: `local-${crypto.randomUUID()}`, visibility: 'PRIVATE', noteText: noteText.trim(), createdAt: new Date().toISOString(), pending: true };
    const mutation: OfflineMutation = { id: crypto.randomUUID(), meetingId, wardId: snapshot.wardId, operation: 'CREATE_PRIVATE_NOTE', payload: { target: { type: 'MEETING', meetingId }, noteText: note.noteText }, createdAt: note.createdAt, status: 'pending' };
    await persist({ ...snapshot, notes: [note, ...(snapshot.notes ?? [])] });
    await queueOfflineMutation(mutation); setNoteText(''); await refreshPending(); await sync();
  }
  async function toggleProgress(index: number) { if (!snapshot) return; await persist({ ...snapshot, progress: { ...(snapshot.progress ?? {}), [String(index)]: !snapshot.progress?.[String(index)] } }); }
  async function updateNote() {
    if (!snapshot || !editingNoteId || !editingText.trim()) return;
    const note = snapshot.notes?.find((item) => item.id === editingNoteId);
    if (!note || note.id.startsWith('local-')) return;
    const mutation: OfflineMutation = { id: crypto.randomUUID(), meetingId, wardId: snapshot.wardId, operation: 'UPDATE_PRIVATE_NOTE', payload: { noteId: note.id, noteText: editingText.trim() }, createdAt: new Date().toISOString(), status: 'pending' };
    await persist({ ...snapshot, notes: snapshot.notes?.map((item) => item.id === note.id ? { ...item, noteText: editingText.trim(), pending: true } : item) });
    await queueOfflineMutation(mutation); setEditingNoteId(null); setEditingText(''); await refreshPending(); await sync();
  }

  if (error && !snapshot) return <main className="mx-auto max-w-3xl p-6"><p className="text-destructive">{error}</p></main>;
  if (!snapshot) return <main className="mx-auto max-w-3xl p-6"><p>Loading offline copy…</p></main>;
  return <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
    <section className="rounded-lg border bg-card p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs uppercase tracking-wide text-muted-foreground">Offline copy</p><h1 className="text-2xl font-semibold">At the Stand</h1><p className="text-sm text-muted-foreground">{snapshot.meeting.meetingDate} · {snapshot.meeting.meetingType}</p></div><span className="rounded-full border px-3 py-1 text-sm">{navigator.onLine ? 'Online' : 'Offline'}</span></div><p className="mt-2 text-xs text-muted-foreground">Saved {new Date(snapshot.savedAt).toLocaleString()} · {pending} pending {pending === 1 ? 'change' : 'changes'}{syncing ? ' · Syncing…' : ''}</p><div className="mt-3 flex gap-2"><button className="rounded-md border px-3 py-1 text-sm" onClick={() => setMode('formal')}>Formal Script</button><button className="rounded-md border px-3 py-1 text-sm" onClick={() => setMode('compact')}>Compact Labels</button></div></section>
    <section className="rounded-lg border bg-card p-4"><h2 className="font-semibold">Private notes</h2><textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} className="mt-2 min-h-20 w-full rounded-md border bg-background p-2 text-sm" placeholder="Write a private note…" /><button type="button" className="mt-2 rounded-md border px-3 py-1 text-sm" onClick={() => void addNote()} disabled={!noteText.trim()}>Save note</button>{snapshot.notes?.length ? <ul className="mt-3 space-y-2 text-sm">{snapshot.notes.map((note) => <li key={note.id} className="rounded border p-2"><span className="text-xs text-muted-foreground">{note.pending ? 'Pending sync · ' : ''}{new Date(note.createdAt).toLocaleString()}</span>{editingNoteId === note.id ? <><textarea value={editingText} onChange={(event) => setEditingText(event.target.value)} className="mt-1 min-h-16 w-full rounded border p-2" /><button type="button" className="mt-1 rounded border px-2 py-1 text-xs" onClick={() => void updateNote()}>Save edit</button></> : <><p className="whitespace-pre-wrap">{note.noteText}</p>{!note.pending && !note.id.startsWith('local-') ? <button type="button" className="mt-1 rounded border px-2 py-1 text-xs" onClick={() => { setEditingNoteId(note.id); setEditingText(note.noteText); }}>Edit</button> : null}</>}</li>)}</ul> : null}</section>
    <section className="grid gap-3">{rows.map((row, index) => <OfflineRow key={index} row={row} done={Boolean(snapshot.progress?.[String(index)])} onToggle={() => void toggleProgress(index)} />)}</section>
    {error ? <p className="text-sm text-destructive">{error}</p> : null}
  </main>;
}
