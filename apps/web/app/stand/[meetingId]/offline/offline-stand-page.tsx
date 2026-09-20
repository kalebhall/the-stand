'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import type { StandRow } from '@/src/stand/render';
import {
  clearOfflineData,
  formatOfflineAge,
  getOfflineWriteEpoch,
  getOfflineSnapshotAge,
  ensureOfflineContext,
  loadOfflineSnapshot,
  queueOfflineMutation,
  listOfflineMutations,
  removeOfflineMutation,
  saveOfflineSnapshot,
  updateOfflineMutation,
  type OfflineAgeLabels,
  type OfflineMutation,
  type OfflineNote,
  type OfflineStandSnapshot
} from '@/src/offline/storage';

function membershipActionLabel(actionType: string, translate: (key: string) => string): string {
  return (
    {
      WELCOME_NEW_MEMBER: translate('action_WELCOME_NEW_MEMBER'),
      RECOGNIZE_BAPTIZED_CHILD: translate('action_RECOGNIZE_BAPTIZED_CHILD'),
      BAPTISM_CONFIRMATION_FOLLOW_UP: translate('action_BAPTISM_CONFIRMATION_FOLLOW_UP'),
      BABY_BLESSING: translate('action_BABY_BLESSING'),
      PRIESTHOOD_ORDINATION: translate('action_PRIESTHOOD_ORDINATION'),
      PRIESTHOOD_ADVANCEMENT: translate('action_PRIESTHOOD_ADVANCEMENT'),
      ATTENDANCE_LCR_HANDOFF: translate('action_ATTENDANCE_LCR_HANDOFF')
    }[actionType] ?? translate('unknown')
  );
}

function priesthoodOfficeLabel(office: string | null | undefined, translate: (key: string) => string): string | null {
  return (
    {
      DEACON: translate('office_DEACON'),
      TEACHER: translate('office_TEACHER'),
      PRIEST: translate('office_PRIEST'),
      ELDER: translate('office_ELDER'),
      HIGH_PRIEST: translate('office_HIGH_PRIEST'),
      UNKNOWN: translate('office_UNKNOWN')
    }[office ?? ''] ?? null
  );
}

function membershipStatusLabel(status: string, translate: (key: string) => string): string {
  return (
    {
      pending: translate('status_pending'),
      announced: translate('status_announced'),
      action_needed: translate('status_action_needed'),
      completed: translate('status_completed')
    }[status] ?? translate('unknown')
  );
}

function membershipDetailStatusLabel(status: string | null | undefined, translate: (key: string) => string): string {
  return (
    {
      planned: translate('detail_planned'),
      completed: translate('detail_completed'),
      cancelled: translate('detail_cancelled'),
      not_required: translate('detail_not_required'),
      needed: translate('detail_needed'),
      scheduled: translate('detail_scheduled')
    }[status ?? ''] ?? translate('unknown')
  );
}

function OfflineRow({ row, done, onToggle }: { row: StandRow; done: boolean; onToggle: () => void }) {
  const t = useTranslations('offline');
  const programNotes = 'programNotes' in row ? row.programNotes : null;
  const content =
    row.kind === 'welcome' ? (
      <p className="text-lg leading-relaxed">{row.text}</p>
    ) : row.kind === 'sacrament' ? (
      <>
        <p className="text-sm uppercase tracking-wide text-muted-foreground">{t('sacrament')}</p>
        <div className="mt-3 space-y-4 leading-relaxed">
          <section>
            <h2 className="font-semibold">{t('breadPrayer')}</h2>
            <p>
              O God, the Eternal Father, we ask thee in the name of thy Son, Jesus Christ, to bless and sanctify this bread to the souls of
              all those who partake of it, that they may eat in remembrance of the body of thy Son, and witness unto thee, O God, the
              Eternal Father, that they are willing to take upon them the name of thy Son, and always remember him and keep his commandments
              which he has given them; that they may always have his Spirit to be with them. Amen.
            </p>
          </section>
          <section>
            <h2 className="font-semibold">{t('waterPrayer')}</h2>
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
        <p className="font-semibold">{t('wardBusiness')}</p>
        <p className="mt-2 text-sm">{t('membershipReadOnly')}</p>
      </>
    ) : row.kind === 'standard' ? (
      <>
        <p className="text-sm uppercase tracking-wide text-muted-foreground">{row.label}</p>
        {row.hymnUrl ? (
          <a
            className="mt-1 block whitespace-pre-wrap text-lg font-medium text-primary underline underline-offset-4"
            href={row.hymnUrl}
            target="_blank"
            rel="noreferrer"
          >
            {row.details}
            <span className="ml-2 text-sm font-normal">{t('openHymn')}</span>
          </a>
        ) : (
          <p className="mt-1 whitespace-pre-wrap text-lg font-medium">{row.details}</p>
        )}
      </>
    ) : (
      <>
        <p className="text-sm uppercase tracking-wide text-muted-foreground">{row.kind === 'sustain' ? t('sustain') : t('release')}</p>
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
          {done ? t('completed') : t('markComplete')}
        </button>
      </div>
    </article>
  );
}

export default function OfflineStandPage({ meetingId }: { meetingId: string }) {
  const t = useTranslations('offline');
  const offlineAgeLabels: OfflineAgeLabels = {
    unknownAge: t('unknownAge'),
    lessThanMinuteAgo: t('lessThanMinuteAgo'),
    minuteAgo: (count) => t('minuteAgo', { count }),
    minutesAgo: (count) => t('minutesAgo', { count }),
    hourAgo: (count) => t('hourAgo', { count }),
    hoursAgo: (count) => t('hoursAgo', { count }),
    dayAgo: (count) => t('dayAgo', { count }),
    daysAgo: (count) => t('daysAgo', { count })
  };
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
  const contextGeneration = useRef(0);
  const syncLock = useRef(false);

  const persist = useCallback(async (next: OfflineStandSnapshot) => {
    setSnapshot(next);
    await saveOfflineSnapshot(next);
  }, []);
  const refreshPending = useCallback(
    async (expectedGeneration = contextGeneration.current) => {
      const mutations = await listOfflineMutations();
      if (contextGeneration.current !== expectedGeneration) return;
      setPending(
        mutations.filter(
          (item) => item.userId === userId && item.wardId === activeWardId && item.meetingId === meetingId && item.status !== 'failed'
        ).length
      );
    },
    [activeWardId, meetingId, userId]
  );
  const sync = useCallback(async () => {
    if (!navigator.onLine || syncLock.current || !userId || !activeWardId || !snapshot) return;
    if (snapshot.userId !== userId || snapshot.wardId !== activeWardId || snapshot.meeting.id !== meetingId) return;
    syncLock.current = true;
    const generation = contextGeneration.current;
    const writeEpoch = getOfflineWriteEpoch();
    const isCurrent = () => contextGeneration.current === generation;
    let mutations: OfflineMutation[];
    try {
      mutations = (await listOfflineMutations()).filter(
        (item) => item.userId === userId && item.meetingId === meetingId && item.wardId === activeWardId && item.status === 'pending'
      );
    } catch {
      syncLock.current = false;
      return;
    }
    if (!isCurrent()) {
      syncLock.current = false;
      return;
    }
    if (!mutations.length) {
      setPending(0);
      syncLock.current = false;
      return;
    }
    if (!isCurrent()) {
      syncLock.current = false;
      return;
    }
    setSyncing(true);
    try {
      const response = await fetch(`/api/w/${snapshot?.wardId}/meetings/${meetingId}/offline-sync`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mutations })
      });
      if (!response.ok) throw new Error(t('syncError'));
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
      if (!isCurrent()) return;
      for (const result of payload.results)
        if (result.status === 'applied' || result.status === 'duplicate') await removeOfflineMutation(result.mutationId, writeEpoch);
      let syncSnapshot = (await loadOfflineSnapshot(userId, activeWardId, meetingId)) ?? snapshot;
      if (syncSnapshot) {
        const applied = payload.results.filter((result) => result.status === 'applied' || result.status === 'duplicate');
        const next = {
          ...syncSnapshot,
          notes: syncSnapshot.notes?.map((note) => {
            const mutation = mutations.find((item) => item.payload.noteId === note.id || item.payload.localNoteId === note.id);
            const result = mutation ? applied.find((item) => item.mutationId === mutation.id) : undefined;
            return result ? { ...note, id: result.noteId ?? note.id, updatedAt: result.updatedAt ?? note.updatedAt, pending: false } : note;
          }),
          businessLines: syncSnapshot.businessLines.map((line) => {
            const mutation = mutations.find((item) => item.payload.lineId === line.id);
            const result = mutation ? applied.find((item) => item.mutationId === mutation.id) : undefined;
            return result ? { ...line, status: 'announced', updatedAt: result.updatedAt ?? line.updatedAt } : line;
          })
        };
        syncSnapshot = next;
        if (!isCurrent()) return;
        setSnapshot(next);
        await saveOfflineSnapshot(next);
      }
      for (const result of payload.results)
        if (result.status === 'rejected') {
          const mutation = mutations.find((item) => item.id === result.mutationId);
          if (mutation) {
            await updateOfflineMutation(
              {
                ...mutation,
                status: 'failed',
                error: result.error
              },
              writeEpoch
            );
            if (syncSnapshot) {
              const next = {
                ...syncSnapshot,
                notes:
                  mutation.operation === 'CREATE_PRIVATE_NOTE'
                    ? syncSnapshot.notes?.filter((note) => note.id !== mutation.payload.localNoteId)
                    : syncSnapshot.notes?.map((note) =>
                        mutation.operation === 'UPDATE_PRIVATE_NOTE' && note.id === mutation.payload.noteId
                          ? { ...note, noteText: mutation.payload.previousNoteText ?? note.noteText, pending: false }
                          : note
                      ),
                businessLines:
                  mutation.operation === 'MARK_BUSINESS_ANNOUNCED'
                    ? syncSnapshot.businessLines.map((line) =>
                        line.id === mutation.payload.lineId ? { ...line, status: 'pending' } : line
                      )
                    : syncSnapshot.businessLines
              };
              syncSnapshot = next;
              if (!isCurrent()) return;
              setSnapshot(next);
              await saveOfflineSnapshot(next);
            }
          }
          if (!isCurrent()) return;
          setError(t('syncError'));
        }
      for (const result of payload.results)
        if (result.status === 'conflict') {
          const mutation = mutations.find((item) => item.id === result.mutationId);
          if (mutation)
            await updateOfflineMutation(
              {
                ...mutation,
                status: 'conflict',
                error: result.error,
                serverText: result.serverText,
                serverStatus: result.serverStatus,
                serverRevision: result.serverRevision
              },
              writeEpoch
            );
          if (!isCurrent()) return;
          if (mutation && result.serverRevision)
            setConflict({
              mutation,
              serverText: result.serverText,
              serverStatus: result.serverStatus,
              serverRevision: result.serverRevision
            });
          if (result.lineId && syncSnapshot) {
            const next = {
              ...syncSnapshot,
              businessLines: syncSnapshot.businessLines.map((line) => (line.id === result.lineId ? { ...line, status: 'pending' } : line))
            };
            syncSnapshot = next;
            if (!isCurrent()) return;
            setSnapshot(next);
            await saveOfflineSnapshot(next);
          }
          if (!isCurrent()) return;
          setError(t('syncError'));
        }
      const remaining = await listOfflineMutations();
      if (
        !remaining.some(
          (item) => item.userId === userId && item.wardId === activeWardId && item.meetingId === meetingId && item.status !== 'failed'
        ) &&
        syncSnapshot
      ) {
        const next = { ...syncSnapshot, notes: syncSnapshot.notes?.map((note) => ({ ...note, pending: false })) };
        syncSnapshot = next;
        if (!isCurrent()) return;
        setSnapshot(next);
        await saveOfflineSnapshot(next);
      }
      await refreshPending(generation);
    } catch {
      if (isCurrent()) setError(t('syncError'));
    } finally {
      if (isCurrent()) setSyncing(false);
      syncLock.current = false;
    }
  }, [activeWardId, meetingId, refreshPending, snapshot, t, userId]);

  useEffect(() => {
    contextGeneration.current += 1;
    setSnapshot(null);
    setConflict(null);
    setPending(0);
    setError(null);
    setSyncing(false);
    setNoteText('');
    setEditingNoteId(null);
    setEditingText('');
    setNoteComposerOpen(false);
  }, [activeWardId, meetingId, userId]);

  useEffect(() => {
    const clearRenderedOfflineState = () => {
      contextGeneration.current += 1;
      setSnapshot(null);
      setConflict(null);
      setPending(0);
      setError(null);
      setSyncing(false);
      setNoteText('');
      setEditingNoteId(null);
      setEditingText('');
      setNoteComposerOpen(false);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'the-stand-offline-deletion-pending') clearRenderedOfflineState();
    };
    window.addEventListener('offline-data-cleared', clearRenderedOfflineState);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('offline-data-cleared', clearRenderedOfflineState);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    const generation = contextGeneration.current;
    if (!userId || !activeWardId) return;
    let cancelled = false;
    void ensureOfflineContext(userId, activeWardId)
      .then(() => loadOfflineSnapshot(userId, activeWardId, meetingId))
      .then(async (value) => {
        if (cancelled || contextGeneration.current !== generation) return;
        if (value && (value.userId !== userId || value.wardId !== activeWardId || value.meeting.id !== meetingId)) return;
        setSnapshot(value);
        await refreshPending(generation);
      })
      .catch(() => {
        if (!cancelled && contextGeneration.current === generation) setError(t('openError'));
      });
    return () => {
      cancelled = true;
    };
  }, [activeWardId, meetingId, refreshPending, t, userId]);

  async function deleteOfflineData() {
    if (!window.confirm(t('deleteConfirm'))) return;
    // Invalidate every in-flight load/sync before clearing storage so stale private data cannot return.
    contextGeneration.current += 1;
    setSnapshot(null);
    setConflict(null);
    setPending(0);
    setError(null);
    setSyncing(false);
    setNoteText('');
    setEditingNoteId(null);
    setEditingText('');
    setNoteComposerOpen(false);
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
    const generation = contextGeneration.current;
    const isCurrent = () => contextGeneration.current === generation;
    if (!snapshot || !userId || !noteText.trim() || !isCurrent()) return;
    const note: OfflineNote = {
      id: `local-${crypto.randomUUID()}`,
      visibility: 'PRIVATE',
      noteText: noteText.trim(),
      createdAt: new Date().toISOString(),
      pending: true
    };
    const mutation: OfflineMutation = {
      id: crypto.randomUUID(),
      userId,
      meetingId,
      wardId: snapshot.wardId,
      operation: 'CREATE_PRIVATE_NOTE',
      payload: { localNoteId: note.id, target: { type: 'MEETING', meetingId }, noteText: note.noteText },
      createdAt: note.createdAt,
      status: 'pending'
    };
    if (!isCurrent()) return;
    await persist({ ...snapshot, notes: [note, ...(snapshot.notes ?? [])] });
    if (!isCurrent()) return;
    await queueOfflineMutation(mutation);
    if (!isCurrent()) return;
    setNoteText('');
    await refreshPending(generation);
    if (!isCurrent()) return;
    await sync();
  }
  async function toggleProgress(index: number) {
    const generation = contextGeneration.current;
    if (!snapshot || contextGeneration.current !== generation) return;
    await persist({ ...snapshot, progress: { ...(snapshot.progress ?? {}), [String(index)]: !snapshot.progress?.[String(index)] } });
    if (contextGeneration.current !== generation) return;
  }
  async function announceBusinessLine(lineId: string) {
    const generation = contextGeneration.current;
    const isCurrent = () => contextGeneration.current === generation;
    if (!snapshot || !userId || !isCurrent()) return;
    const line = snapshot.businessLines.find((item) => item.id === lineId);
    if (!line || line.status !== 'pending' || !line.updatedAt) return;
    const mutation: OfflineMutation = {
      id: crypto.randomUUID(),
      userId,
      meetingId,
      wardId: snapshot.wardId,
      operation: 'MARK_BUSINESS_ANNOUNCED',
      payload: { lineId, noteText: '', baseRevision: line.updatedAt },
      createdAt: new Date().toISOString(),
      status: 'pending'
    };
    if (!isCurrent()) return;
    await persist({
      ...snapshot,
      businessLines: snapshot.businessLines.map((item) => (item.id === lineId ? { ...item, status: 'announced' } : item))
    });
    if (!isCurrent()) return;
    await queueOfflineMutation(mutation);
    if (!isCurrent()) return;
    await refreshPending(generation);
    if (!isCurrent()) return;
    await sync();
  }
  async function updateNote() {
    const generation = contextGeneration.current;
    const isCurrent = () => contextGeneration.current === generation;
    if (!snapshot || !userId || !editingNoteId || !editingText.trim() || !isCurrent()) return;
    const note = snapshot.notes?.find((item) => item.id === editingNoteId);
    if (!note || note.id.startsWith('local-')) return;
    const mutation: OfflineMutation = {
      id: crypto.randomUUID(),
      userId,
      meetingId,
      wardId: snapshot.wardId,
      operation: 'UPDATE_PRIVATE_NOTE',
      payload: { noteId: note.id, noteText: editingText.trim(), previousNoteText: note.noteText, baseRevision: note.updatedAt },
      createdAt: new Date().toISOString(),
      status: 'pending'
    };
    if (!isCurrent()) return;
    await persist({
      ...snapshot,
      notes: snapshot.notes?.map((item) => (item.id === note.id ? { ...item, noteText: editingText.trim(), pending: true } : item))
    });
    if (!isCurrent()) return;
    await queueOfflineMutation(mutation);
    if (!isCurrent()) return;
    setEditingNoteId(null);
    setEditingText('');
    await refreshPending(generation);
    if (!isCurrent()) return;
    await sync();
  }
  async function resolveConflict(choice: 'server' | 'offline' | 'both') {
    const generation = contextGeneration.current;
    const writeEpoch = getOfflineWriteEpoch();
    const isCurrent = () => contextGeneration.current === generation;
    if (!snapshot || !conflict || !userId || !isCurrent()) return;
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
        if (!isCurrent()) return;
        await removeOfflineMutation(conflict.mutation.id, writeEpoch);
        if (!isCurrent()) return;
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
        if (!isCurrent()) return;
        await removeOfflineMutation(conflict.mutation.id, writeEpoch);
        if (!isCurrent()) return;
        await persist(next);
      }
      if (!isCurrent()) return;
      setConflict(null);
      setError(null);
      if (!isCurrent()) return;
      await refreshPending(generation);
    } else if (choice === 'offline') {
      if (!isCurrent()) return;
      await updateOfflineMutation({
        ...conflict.mutation,
        status: 'pending',
        error: undefined,
        serverText: undefined,
        serverStatus: undefined,
        serverRevision: undefined,
        payload: { ...conflict.mutation.payload, baseRevision: conflict.serverRevision }
      });
      if (lineId) {
        if (!isCurrent()) return;
        await persist({
          ...snapshot,
          businessLines: snapshot.businessLines.map((line) => (line.id === lineId ? { ...line, status: 'announced' } : line))
        });
        if (!isCurrent()) return;
      }
      if (!isCurrent()) return;
      setConflict(null);
      setError(null);
      if (!isCurrent()) return;
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
        userId,
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
      if (!isCurrent()) return;
      await removeOfflineMutation(conflict.mutation.id, writeEpoch);
      if (!isCurrent()) return;
      await persist(next);
      if (!isCurrent()) return;
      await queueOfflineMutation(keepBoth);
      if (!isCurrent()) return;
      setConflict(null);
      setError(null);
      if (!isCurrent()) return;
      await refreshPending(generation);
      if (!isCurrent()) return;
      await sync();
    }
  }

  const snapshotMatchesContext =
    snapshot && snapshot.userId === userId && snapshot.wardId === activeWardId && snapshot.meeting.id === meetingId;
  if (snapshot && !snapshotMatchesContext)
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p>{t('loading')}</p>
      </main>
    );
  if (error && !snapshot)
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p className="text-destructive">{error}</p>
      </main>
    );
  if (!snapshot)
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p>{t('loading')}</p>
      </main>
    );
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('copy')}</p>
            <h1 className="text-2xl font-semibold">{t('title')}</h1>
            <p className="text-sm text-muted-foreground">
              {snapshot.meeting.meetingDate} · {snapshot.meeting.meetingType}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/manual#offline" className="text-sm font-medium underline underline-offset-4">
              Offline help
            </Link>
            <span className="rounded-full border px-3 py-1 text-sm">{navigator.onLine ? t('online') : t('offline')}</span>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
          {t('savedAt', { date: new Date(snapshot.savedAt).toLocaleString() })} (
          {formatOfflineAge(snapshot.savedAt, Date.now(), offlineAgeLabels)}) · {pending} {t(pending === 1 ? 'change' : 'changes')}
          {syncing ? ` · ${t('syncing')}` : ''}
        </p>
        <p
          className={`mt-2 rounded-md border p-3 text-sm ${getOfflineSnapshotAge(snapshot.savedAt).isStale ? 'border-amber-500/50 bg-amber-500/10' : 'bg-muted/30'}`}
          role="status"
        >
          {navigator.onLine ? t('connectedCopy') : t('offlineNotice')}
          {getOfflineSnapshotAge(snapshot.savedAt).isStale ? ` ${t('olderNotice')}` : ''}
        </p>
        <div className="mt-3 flex gap-2">
          <button className="rounded-md border px-3 py-1 text-sm" onClick={() => setMode('formal')}>
            {t('formalScript')}
          </button>
          <button className="rounded-md border px-3 py-1 text-sm" onClick={() => setMode('compact')}>
            {t('compactLabels')}
          </button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{t('confidentiality')}</p>
        <button
          type="button"
          className="mt-2 rounded-md border px-3 py-1 text-sm"
          onClick={() => void deleteOfflineData()}
          disabled={clearing}
        >
          {clearing ? t('deletingData') : t('deleteData')}
        </button>
      </section>
      {snapshot.technology ? (
        <section className="rounded-lg border bg-card p-4">
          <h2 className="font-semibold">{t('technologyTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('technologyDescription')}{' '}
            <a className="underline" href="/technology">
              {t('technology')}
            </a>
            .
          </p>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">{t('owner')}</dt>
              <dd>{snapshot.technology.ownerName || t('unassigned')}</dd>
            </div>
            {[
              [t('roomReady'), snapshot.technology.roomReady],
              [t('audioReady'), snapshot.technology.audioReady],
              [t('streamReady'), snapshot.technology.streamReady],
              [t('accessibilityChecked'), snapshot.technology.accessibilityChecked],
              [t('recordingDeletionReminder'), snapshot.technology.recordingDeletionReminder],
              [t('startConfirmed'), Boolean(snapshot.technology.startConfirmedAt)],
              [t('stopConfirmed'), Boolean(snapshot.technology.stopConfirmedAt)]
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt className="text-muted-foreground">{String(label)}</dt>
                <dd>{value ? t('complete') : t('needsAttention')}</dd>
              </div>
            ))}
          </dl>
          {snapshot.technology.authorizedLink ? (
            <p className="mt-3 text-sm">
              <a className="underline" href={snapshot.technology.authorizedLink} target="_blank" rel="noreferrer">
                {t('openTechnology')}
              </a>
            </p>
          ) : null}
        </section>
      ) : null}
      {snapshot.notes?.length || noteComposerOpen ? (
        <section className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">{t('privateNotes')}</h2>
            <button type="button" className="rounded-md border px-3 py-1 text-sm" onClick={() => setNoteComposerOpen(true)}>
              {t('addNote')}
            </button>
          </div>
          {noteComposerOpen ? (
            <>
              <textarea
                value={noteText}
                onChange={(event) => setNoteText(event.target.value)}
                className="mt-2 min-h-20 w-full rounded-md border bg-background p-2 text-sm"
                placeholder={t('writeNote')}
                autoFocus
              />
              <button
                type="button"
                className="mt-2 rounded-md border px-3 py-1 text-sm"
                onClick={() => void addNote()}
                disabled={!noteText.trim()}
              >
                {t('saveNote')}
              </button>
            </>
          ) : null}
          {snapshot.notes?.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {snapshot.notes.map((note) => (
                <li key={note.id} className="rounded border p-2">
                  <span className="text-xs text-muted-foreground">
                    {note.pending ? `${t('pendingSync')} · ` : ''}
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
                        {t('saveEdit')}
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
                          {t('edit')}
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
            {t('addNote')}
          </button>
        </div>
      )}
      <section className="rounded-lg border bg-card p-4">
        <h2 className="font-semibold">{t('wardBusiness')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('membershipReadOnly')}</p>
        {snapshot.membershipActions?.length ? (
          <ul className="mt-3 space-y-2 text-sm">
            {snapshot.membershipActions.map((action) => (
              <li key={action.id} className="rounded border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {membershipActionLabel(action.actionType, t)}
                      {action.carriedForward ? ` · ${t('carriedForward')}` : ''}
                    </p>
                    <p className="font-medium">{action.memberName}</p>
                    {priesthoodOfficeLabel(action.priesthoodOffice, t) ? (
                      <p className="text-muted-foreground">
                        {t('office')}: {priesthoodOfficeLabel(action.priesthoodOffice, t)}
                      </p>
                    ) : null}
                    {action.actionType === 'BAPTISM_CONFIRMATION_FOLLOW_UP' ? (
                      <p className="text-muted-foreground">
                        {t('baptism')}: {membershipDetailStatusLabel(action.baptismStatus ?? 'planned', t)}
                        {action.baptismDate ? ` (${action.baptismDate})` : ''} · {t('confirmation')}:{' '}
                        {membershipDetailStatusLabel(action.confirmationStatus ?? 'planned', t)}
                        {action.confirmationDate ? ` (${action.confirmationDate})` : ''}
                      </p>
                    ) : null}
                    {action.responsibleLeader ? (
                      <p className="text-muted-foreground">
                        {t('responsible')}: {action.responsibleLeader}
                      </p>
                    ) : null}
                    {action.interviewStatus && action.interviewStatus !== 'not_required' ? (
                      <p className="text-muted-foreground">
                        {t('interview')}: {membershipDetailStatusLabel(action.interviewStatus, t)}
                      </p>
                    ) : null}
                  </div>
                  <span className="rounded-full border px-2 py-1 text-xs">{membershipStatusLabel(action.status, t)}</span>
                </div>
                {action.lcrFollowUpStatus === 'needed' ? (
                  <p className="mt-2 text-xs font-medium text-amber-700">{t('lcrUpdateNeeded')}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <ul className="mt-2 space-y-2 text-sm">
          {snapshot.businessLines.map((line) => (
            <li key={line.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
              <span>
                {line.memberName} — {line.callingName} ({membershipStatusLabel(line.status, t)}
                {line.carriedForward ? `, ${t('carriedForward')}` : ''})
              </span>
              {line.status === 'pending' ? (
                <button
                  type="button"
                  className="rounded border px-2 py-1 text-xs"
                  onClick={() => void announceBusinessLine(line.id)}
                  disabled={!line.updatedAt}
                >
                  {t('markAnnounced')}
                </button>
              ) : (
                <span className="text-xs text-muted-foreground">{t('announced')}</span>
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
              {t('resolveConflict')}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('conflictDetail', {
                kind: conflict.mutation.operation === 'MARK_BUSINESS_ANNOUNCED' ? t('businessAction') : t('changeKind')
              })}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded border p-3">
                <h3 className="font-medium">{t('yourChange')}</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm">
                  {conflict.mutation.operation === 'MARK_BUSINESS_ANNOUNCED'
                    ? `${t('status')}: ${t('announced').toLowerCase()}`
                    : conflict.mutation.payload.noteText}
                </p>
              </div>
              <div className="rounded border p-3">
                <h3 className="font-medium">{t('serverChange')}</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm">
                  {conflict.mutation.operation === 'MARK_BUSINESS_ANNOUNCED'
                    ? `${t('status')}: ${membershipStatusLabel(conflict.serverStatus ?? 'unknown', t)}`
                    : conflict.serverText}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t('serverRevision')}: {conflict.serverRevision}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => void resolveConflict('server')}>
                {t('keepServer')}
              </button>
              <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => void resolveConflict('offline')}>
                {t('keepMine')}
              </button>
              <button
                type="button"
                className="rounded border px-3 py-2 text-sm"
                onClick={() => void resolveConflict('both')}
                disabled={conflict.mutation.operation !== 'UPDATE_PRIVATE_NOTE'}
              >
                {t('keepBoth')}
                {conflict.mutation.operation !== 'UPDATE_PRIVATE_NOTE' ? ` (${t('notAvailable')})` : ''}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
