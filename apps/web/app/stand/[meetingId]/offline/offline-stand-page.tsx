'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import type { StandRow } from '@/src/stand/render';
import {
  clearOfflineData,
  ensureOfflineContext,
  loadOfflineSnapshot,
  queueOfflineMutation,
  listOfflineMutations,
  removeOfflineMutation,
  saveOfflineSnapshot,
  updateOfflineMutation,
  type OfflineMutation,
  type OfflineNote,
  type OfflineStandSnapshot
} from '@/src/offline/storage';

function membershipActionLabel(actionType: string): string {
  return {
    WELCOME_NEW_MEMBER: 'Welcome new member',
    RECOGNIZE_BAPTIZED_CHILD: 'Recognize baptized child',
    BABY_BLESSING: 'Baby blessing',
    PRIESTHOOD_ORDINATION: 'Priesthood ordination',
    PRIESTHOOD_ADVANCEMENT: 'Priesthood advancement'
  }[actionType] ?? actionType.replaceAll('_', ' ');
}

function priesthoodOfficeLabel(office: string | null | undefined): string | null {
  return { DEACON: 'Deacon', TEACHER: 'Teacher', PRIEST: 'Priest', ELDER: 'Elder', HIGH_PRIEST: 'High priest', UNKNOWN: 'Unknown during planning' }[office ?? ''] ?? null;
}

function membershipStatusLabel(status: string): string {
  return status === 'action_needed' ? 'Action needed' : status[0]?.toUpperCase() + status.slice(1);
}

function OfflineRow({ row, done, onToggle }: { row: StandRow; done: boolean; onToggle: () => void }) {
  const programNotes = 'programNotes' in row ? row.programNotes : null;
  const content =
    row.kind === 'welcome' ? (
      <p className="text-lg leading-relaxed">{row.text}</p>
    ) : row.kind === 'sacrament' ? (
      <>
        <p className="text-sm uppercase tracking-wide text-muted-foreground">Sacrament</p>
        <div className="mt-3 space-y-4 leading-relaxed">
          <section>
            <h2 className="font-semibold">Bread prayer</h2>
            <p>
              O God, the Eternal Father, we ask thee in the name of thy Son, Jesus Christ, to bless and sanctify this bread to the souls of
              all those who partake of it, that they may eat in remembrance of the body of thy Son, and witness unto thee, O God, the
              Eternal Father, that they are willing to take upon them the name of thy Son, and always remember him and keep his commandments
              which he has given them; that they may always have his Spirit to be with them. Amen.
            </p>
          </section>
          <section>
            <h2 className="font-semibold">Water prayer</h2>
            <p>
              O God, the Eternal Father, we ask thee in the name of thy Son, Jesus Christ, to bless and sanctify this water to the souls of
              all those who drink of it, that they may do it in remembrance of the blood of thy Son, which was shed for them; that they may
              witness unto thee, O God, the Eternal Father, that they do always remember him, that they may have his Spirit to be with them.
              Amen.
            </p>
          </section>
        </div>
      </>
    ) : row.kind === 'ward_business' ? (
      <>
        <p className="font-semibold">Ward and Stake Business</p>
        <p className="mt-2 text-sm">Use connected copy for business actions.</p>
      </>
    ) : row.kind === 'standard' ? (
      <>
        <p className="text-sm uppercase tracking-wide text-muted-foreground">{row.label}</p>
        <p className="mt-1 whitespace-pre-wrap text-lg font-medium">{row.details}</p>
      </>
    ) : (
      <>
        <p className="text-sm uppercase tracking-wide text-muted-foreground">{row.kind === 'sustain' ? 'Sustain' : 'Release'}</p>
        <p className="text-lg leading-relaxed">
          {row.segments.map((segment, index) =>
            segment.bold ? <strong key={index}>{segment.text}</strong> : <span key={index}>{segment.text}</span>
          )}
        </p>
      </>
    );
  return (
    <article className={`rounded-lg border bg-card p-4 ${done ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {content}
          {programNotes?.trim() ? <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{programNotes}</p> : null}
        </div>
        <button type="button" className="shrink-0 rounded-md border px-2 py-1 text-xs" onClick={onToggle}>
          {done ? 'Completed' : 'Mark complete'}
        </button>
      </div>
    </article>
  );
}

export default function OfflineStandPage({ meetingId }: { meetingId: string }) {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const activeWardId = session?.activeWardId;
  const [snapshot, setSnapshot] = useState<OfflineStandSnapshot | null>(null);
  const [mode, setMode] = useState<'formal' | 'compact'>('formal');
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [pending, setPending] = useState(0);
  const [clearing, setClearing] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [noteComposerOpen, setNoteComposerOpen] = useState(false);
  const [conflict, setConflict] = useState<{
    mutation: OfflineMutation;
    serverText?: string;
    serverStatus?: string;
    serverRevision: string;
  } | null>(null);

  const persist = useCallback(async (next: OfflineStandSnapshot) => {
    setSnapshot(next);
    await saveOfflineSnapshot(next);
  }, []);
  const refreshPending = useCallback(
    async () => setPending((await listOfflineMutations()).filter((item) => item.meetingId === meetingId).length),
    [meetingId]
  );
  const sync = useCallback(async () => {
    if (!navigator.onLine || syncing) return;
    const mutations = (await listOfflineMutations()).filter((item) => item.meetingId === meetingId);
    if (!mutations.length) {
      setPending(0);
      return;
    }
    setSyncing(true);
    try {
      const response = await fetch(`/api/w/${snapshot?.wardId}/meetings/${meetingId}/offline-sync`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mutations })
      });
      if (!response.ok) throw new Error('Sync failed');
      const payload = (await response.json()) as {
        results: Array<{
          mutationId: string;
          status: string;
          noteId?: string;
          lineId?: string;
          updatedAt?: string;
          serverText?: string;
          serverStatus?: string;
          serverRevision?: string;
          error?: string;
        }>;
      };
      for (const result of payload.results)
        if (result.status === 'applied' || result.status === 'duplicate') await removeOfflineMutation(result.mutationId);
      if (snapshot) {
        const applied = payload.results.filter((result) => result.status === 'applied' || result.status === 'duplicate');
        const next = {
          ...snapshot,
          notes: snapshot.notes?.map((note) => {
            const mutation = mutations.find((item) => item.payload.noteId === note.id || item.payload.localNoteId === note.id);
            const result = mutation ? applied.find((item) => item.mutationId === mutation.id) : undefined;
            return result ? { ...note, id: result.noteId ?? note.id, updatedAt: result.updatedAt ?? note.updatedAt, pending: false } : note;
          }),
          businessLines: snapshot.businessLines.map((line) => {
            const mutation = mutations.find((item) => item.payload.lineId === line.id);
            const result = mutation ? applied.find((item) => item.mutationId === mutation.id) : undefined;
            return result ? { ...line, status: 'announced', updatedAt: result.updatedAt ?? line.updatedAt } : line;
          })
        };
        setSnapshot(next);
        await saveOfflineSnapshot(next);
      }
      for (const result of payload.results)
        if (result.status === 'conflict') {
          const mutation = mutations.find((item) => item.id === result.mutationId);
          if (mutation)
            await updateOfflineMutation({
              ...mutation,
              status: 'conflict',
              error: result.error,
              serverText: result.serverText,
              serverStatus: result.serverStatus,
              serverRevision: result.serverRevision
            });
          if (mutation && result.serverRevision)
            setConflict({
              mutation,
              serverText: result.serverText,
              serverStatus: result.serverStatus,
              serverRevision: result.serverRevision
            });
          if (result.lineId && snapshot) {
            const next = {
              ...snapshot,
              businessLines: snapshot.businessLines.map((line) => (line.id === result.lineId ? { ...line, status: 'pending' } : line))
            };
            setSnapshot(next);
            await saveOfflineSnapshot(next);
          }
          setError(result.error ?? 'A change conflicted while offline. Review it before retrying.');
        }
      const remaining = await listOfflineMutations();
      if (!remaining.some((item) => item.meetingId === meetingId) && snapshot) {
        const next = { ...snapshot, notes: snapshot.notes?.map((note) => ({ ...note, pending: false })) };
        setSnapshot(next);
        await saveOfflineSnapshot(next);
      }
      await refreshPending();
    } catch {
      setError('Changes waiting to sync.');
    } finally {
      setSyncing(false);
    }
  }, [meetingId, refreshPending, snapshot?.wardId, syncing]);

  useEffect(() => {
    if (!userId || !activeWardId) return;
    void ensureOfflineContext(userId, activeWardId)
      .then(() => loadOfflineSnapshot(userId, activeWardId, meetingId))
      .then(async (value) => {
        setSnapshot(value);
        await refreshPending();
      })
      .catch(() => setError('Unable to open offline copy.'));
  }, [activeWardId, meetingId, refreshPending, userId]);

  async function deleteOfflineData() {
    if (!window.confirm('Delete saved offline meeting data and pending offline changes from this device?')) return;
    setClearing(true);
    try {
      await clearOfflineData();
      setSnapshot(null);
      setPending(0);
    } finally {
      setClearing(false);
    }
  }

  useEffect(() => {
    const run = () => void sync();
    window.addEventListener('online', run);
    document.addEventListener('visibilitychange', run);
    return () => {
      window.removeEventListener('online', run);
      document.removeEventListener('visibilitychange', run);
    };
  }, [sync]);

  const rows = useMemo(
    () =>
      (snapshot?.standRows as unknown as StandRow[] | undefined)?.map((row) =>
        mode === 'compact' && (row.kind === 'sustain' || row.kind === 'release')
          ? { ...row, segments: [{ text: row.summary, bold: false }] }
          : row
      ) ?? [],
    [mode, snapshot]
  );
  async function addNote() {
    if (!snapshot || !noteText.trim()) return;
    const note: OfflineNote = {
      id: `local-${crypto.randomUUID()}`,
      visibility: 'PRIVATE',
      noteText: noteText.trim(),
      createdAt: new Date().toISOString(),
      pending: true
    };
    const mutation: OfflineMutation = {
      id: crypto.randomUUID(),
      meetingId,
      wardId: snapshot.wardId,
      operation: 'CREATE_PRIVATE_NOTE',
      payload: { localNoteId: note.id, target: { type: 'MEETING', meetingId }, noteText: note.noteText },
      createdAt: note.createdAt,
      status: 'pending'
    };
    await persist({ ...snapshot, notes: [note, ...(snapshot.notes ?? [])] });
    await queueOfflineMutation(mutation);
    setNoteText('');
    await refreshPending();
    await sync();
  }
  async function toggleProgress(index: number) {
    if (!snapshot) return;
    await persist({ ...snapshot, progress: { ...(snapshot.progress ?? {}), [String(index)]: !snapshot.progress?.[String(index)] } });
  }
  async function announceBusinessLine(lineId: string) {
    if (!snapshot) return;
    const line = snapshot.businessLines.find((item) => item.id === lineId);
    if (!line || line.status !== 'pending' || !line.updatedAt) return;
    const mutation: OfflineMutation = {
      id: crypto.randomUUID(),
      meetingId,
      wardId: snapshot.wardId,
      operation: 'MARK_BUSINESS_ANNOUNCED',
      payload: { lineId, noteText: '', baseRevision: line.updatedAt },
      createdAt: new Date().toISOString(),
      status: 'pending'
    };
    await persist({
      ...snapshot,
      businessLines: snapshot.businessLines.map((item) => (item.id === lineId ? { ...item, status: 'announced' } : item))
    });
    await queueOfflineMutation(mutation);
    await refreshPending();
    await sync();
  }
  async function updateNote() {
    if (!snapshot || !editingNoteId || !editingText.trim()) return;
    const note = snapshot.notes?.find((item) => item.id === editingNoteId);
    if (!note || note.id.startsWith('local-')) return;
    const mutation: OfflineMutation = {
      id: crypto.randomUUID(),
      meetingId,
      wardId: snapshot.wardId,
      operation: 'UPDATE_PRIVATE_NOTE',
      payload: { noteId: note.id, noteText: editingText.trim(), baseRevision: note.updatedAt },
      createdAt: new Date().toISOString(),
      status: 'pending'
    };
    await persist({
      ...snapshot,
      notes: snapshot.notes?.map((item) => (item.id === note.id ? { ...item, noteText: editingText.trim(), pending: true } : item))
    });
    await queueOfflineMutation(mutation);
    setEditingNoteId(null);
    setEditingText('');
    await refreshPending();
    await sync();
  }
  async function resolveConflict(choice: 'server' | 'offline' | 'both') {
    if (!snapshot || !conflict) return;
    const noteId = conflict.mutation.payload.noteId;
    const lineId = conflict.mutation.payload.lineId;
    if (choice === 'server') {
      if (lineId) {
        const next = {
          ...snapshot,
          businessLines: snapshot.businessLines.map((line) =>
            line.id === lineId ? { ...line, status: conflict.serverStatus ?? line.status, updatedAt: conflict.serverRevision } : line
          )
        };
        await removeOfflineMutation(conflict.mutation.id);
        await persist(next);
      } else if (!noteId || conflict.serverText === undefined) return;
      else {
        const serverText = conflict.serverText;
        const next = {
          ...snapshot,
          notes: snapshot.notes?.map((note) =>
            note.id === noteId ? { ...note, noteText: serverText, updatedAt: conflict.serverRevision, pending: false } : note
          )
        };
        await removeOfflineMutation(conflict.mutation.id);
        await persist(next);
      }
      setConflict(null);
      setError(null);
      await refreshPending();
    } else if (choice === 'offline') {
      await updateOfflineMutation({
        ...conflict.mutation,
        status: 'pending',
        error: undefined,
        serverText: undefined,
        serverStatus: undefined,
        serverRevision: undefined,
        payload: { ...conflict.mutation.payload, baseRevision: conflict.serverRevision }
      });
      if (lineId)
        await persist({
          ...snapshot,
          businessLines: snapshot.businessLines.map((line) => (line.id === lineId ? { ...line, status: 'announced' } : line))
        });
      setConflict(null);
      setError(null);
      await sync();
    } else if (noteId) {
      const newNote: OfflineNote = {
        id: `local-${crypto.randomUUID()}`,
        visibility: 'PRIVATE',
        noteText: conflict.mutation.payload.noteText,
        createdAt: new Date().toISOString(),
        pending: true
      };
      const keepBoth: OfflineMutation = {
        id: crypto.randomUUID(),
        meetingId,
        wardId: snapshot.wardId,
        operation: 'CREATE_PRIVATE_NOTE',
        payload: { localNoteId: newNote.id, target: { type: 'MEETING', meetingId }, noteText: newNote.noteText },
        createdAt: newNote.createdAt,
        status: 'pending'
      };
      if (conflict.serverText === undefined) return;
      const serverText = conflict.serverText;
      const next = {
        ...snapshot,
        notes: [
          newNote,
          ...(snapshot.notes?.map((note) =>
            note.id === noteId ? { ...note, noteText: serverText, updatedAt: conflict.serverRevision, pending: false } : note
          ) ?? [])
        ]
      };
      await removeOfflineMutation(conflict.mutation.id);
      await persist(next);
      await queueOfflineMutation(keepBoth);
      setConflict(null);
      setError(null);
      await refreshPending();
      await sync();
    }
  }

  if (error && !snapshot)
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p className="text-destructive">{error}</p>
      </main>
    );
  if (!snapshot)
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p>Loading offline copy…</p>
      </main>
    );
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Offline copy</p>
            <h1 className="text-2xl font-semibold">At the Stand</h1>
            <p className="text-sm text-muted-foreground">
              {snapshot.meeting.meetingDate} · {snapshot.meeting.meetingType}
            </p>
          </div>
          <span className="rounded-full border px-3 py-1 text-sm">{navigator.onLine ? 'Online' : 'Offline'}</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Saved {new Date(snapshot.savedAt).toLocaleString()} · {pending} pending {pending === 1 ? 'change' : 'changes'}
          {syncing ? ' · Syncing…' : ''}
        </p>
        <div className="mt-3 flex gap-2">
          <button className="rounded-md border px-3 py-1 text-sm" onClick={() => setMode('formal')}>
            Formal Script
          </button>
          <button className="rounded-md border px-3 py-1 text-sm" onClick={() => setMode('compact')}>
            Compact Labels
          </button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          This device contains private ward data. Delete it when finished or before handing device to another user.
        </p>
        <button type="button" className="mt-2 rounded-md border px-3 py-1 text-sm" onClick={() => void deleteOfflineData()} disabled={clearing}>
          {clearing ? 'Deleting offline data…' : 'Delete offline data'}
        </button>
      </section>
      {snapshot.notes?.length || noteComposerOpen ? (
        <section className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Private notes</h2>
            <button type="button" className="rounded-md border px-3 py-1 text-sm" onClick={() => setNoteComposerOpen(true)}>
              Add note
            </button>
          </div>
          {noteComposerOpen ? (
            <>
              <textarea
                value={noteText}
                onChange={(event) => setNoteText(event.target.value)}
                className="mt-2 min-h-20 w-full rounded-md border bg-background p-2 text-sm"
                placeholder="Write a private note…"
                autoFocus
              />
              <button
                type="button"
                className="mt-2 rounded-md border px-3 py-1 text-sm"
                onClick={() => void addNote()}
                disabled={!noteText.trim()}
              >
                Save note
              </button>
            </>
          ) : null}
          {snapshot.notes?.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {snapshot.notes.map((note) => (
                <li key={note.id} className="rounded border p-2">
                  <span className="text-xs text-muted-foreground">
                    {note.pending ? 'Pending sync · ' : ''}
                    {new Date(note.createdAt).toLocaleString()}
                  </span>
                  {editingNoteId === note.id ? (
                    <>
                      <textarea
                        value={editingText}
                        onChange={(event) => setEditingText(event.target.value)}
                        className="mt-1 min-h-16 w-full rounded border p-2"
                      />
                      <button type="button" className="mt-1 rounded border px-2 py-1 text-xs" onClick={() => void updateNote()}>
                        Save edit
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="whitespace-pre-wrap">{note.noteText}</p>
                      {!note.pending && !note.id.startsWith('local-') ? (
                        <button
                          type="button"
                          className="mt-1 rounded border px-2 py-1 text-xs"
                          onClick={() => {
                            setEditingNoteId(note.id);
                            setEditingText(note.noteText);
                          }}
                        >
                          Edit
                        </button>
                      ) : null}
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : (
        <div className="flex justify-end">
          <button type="button" className="rounded-md border px-3 py-1 text-sm" onClick={() => setNoteComposerOpen(true)}>
            Add note
          </button>
        </div>
      )}
      <section className="rounded-lg border bg-card p-4">
        <h2 className="font-semibold">Membership and Ordinances</h2>
        <p className="mt-1 text-sm text-muted-foreground">Read-only conducting reference. Status changes require an online connection.</p>
        {snapshot.membershipActions?.length ? (
          <ul className="mt-3 space-y-2 text-sm">
            {snapshot.membershipActions.map((action) => (
              <li key={action.id} className="rounded border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{membershipActionLabel(action.actionType)}</p>
                    <p className="font-medium">{action.memberName}</p>
                    {priesthoodOfficeLabel(action.priesthoodOffice) ? <p className="text-muted-foreground">Office: {priesthoodOfficeLabel(action.priesthoodOffice)}</p> : null}
                    {action.responsibleLeader ? <p className="text-muted-foreground">Responsible: {action.responsibleLeader}</p> : null}
                    {action.interviewStatus && action.interviewStatus !== 'not_required' ? (
                      <p className="text-muted-foreground">Interview: {action.interviewStatus.replaceAll('_', ' ')}</p>
                    ) : null}
                  </div>
                  <span className="rounded-full border px-2 py-1 text-xs">{membershipStatusLabel(action.status)}</span>
                </div>
                {action.lcrFollowUpStatus === 'needed' ? <p className="mt-2 text-xs font-medium text-amber-700">LCR update needed</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No membership or ordinance actions for this meeting.</p>
        )}
      </section>
      <section className="rounded-lg border bg-card p-4">
        <h2 className="font-semibold">Ward and Stake Business</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {snapshot.businessLines.map((line) => (
            <li key={line.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
              <span>
                {line.memberName} — {line.callingName} ({line.status})
              </span>
              {line.status === 'pending' ? (
                <button
                  type="button"
                  className="rounded border px-2 py-1 text-xs"
                  onClick={() => void announceBusinessLine(line.id)}
                  disabled={!line.updatedAt}
                >
                  Mark announced
                </button>
              ) : (
                <span className="text-xs text-muted-foreground">Announced</span>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className="grid gap-3">
        {rows.map((row, index) => (
          <OfflineRow
            key={index}
            row={row}
            done={Boolean(snapshot.progress?.[String(index)])}
            onToggle={() => void toggleProgress(index)}
          />
        ))}
      </section>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {conflict ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="offline-conflict-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <section className="w-full max-w-2xl rounded-lg border bg-card p-5 shadow-xl">
            <h2 id="offline-conflict-title" className="text-lg font-semibold">
              Resolve offline conflict
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This {conflict.mutation.operation === 'MARK_BUSINESS_ANNOUNCED' ? 'business-line action' : 'change'} changed on server while
              you were offline. Choose what to keep.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded border p-3">
                <h3 className="font-medium">Your offline change</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm">
                  {conflict.mutation.operation === 'MARK_BUSINESS_ANNOUNCED' ? 'Status: announced' : conflict.mutation.payload.noteText}
                </p>
              </div>
              <div className="rounded border p-3">
                <h3 className="font-medium">Server change</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm">
                  {conflict.mutation.operation === 'MARK_BUSINESS_ANNOUNCED'
                    ? `Status: ${conflict.serverStatus ?? 'unknown'}`
                    : conflict.serverText}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">Server revision: {conflict.serverRevision}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => void resolveConflict('server')}>
                Keep server
              </button>
              <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => void resolveConflict('offline')}>
                Keep my change
              </button>
              <button
                type="button"
                className="rounded border px-3 py-2 text-sm"
                onClick={() => void resolveConflict('both')}
                disabled={conflict.mutation.operation !== 'UPDATE_PRIVATE_NOTE'}
              >
                Keep both{conflict.mutation.operation !== 'UPDATE_PRIVATE_NOTE' ? ' (not available)' : ''}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
