'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  cacheOfflinePage,
  clearOfflineData,
  ensureOfflineContext,
  formatOfflineAge,
  getOfflineSnapshotAge,
  listOfflineMutations,
  loadOfflineSnapshot,
  parseOfflineAuthorization,
  saveOfflineSnapshot,
  type OfflineStandSnapshot
} from '@/src/offline/storage';

type OfflineStatus = 'checking' | 'saving' | 'ready' | 'offline' | 'error';

type OfflineTranslate = (key: string, values?: Record<string, string | number>) => string;

function statusLabel(status: OfflineStatus, pending: number, t: OfflineTranslate): string {
  if (status === 'checking') return t('checking');
  if (status === 'saving') return t('saving');
  if (status === 'offline') return t('offlineStatus');
  if (status === 'error') return t('refreshError');
  if (pending > 0) return t('readyPending', { count: pending, changeLabel: t(pending === 1 ? 'change' : 'changes') });
  return t('ready');
}

export function OfflineStandButton({ userId, wardId, meetingId }: { userId: string; wardId: string; meetingId: string }) {
  const t = useTranslations('offline');
  const [status, setStatus] = useState<OfflineStatus>('checking');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [clearing, setClearing] = useState(false);
  const running = useRef(false);
  const contextGeneration = useRef(0);

  const refreshPending = useCallback(
    async (expectedGeneration = contextGeneration.current) => {
      const mutations = await listOfflineMutations();
      if (contextGeneration.current !== expectedGeneration) return;
      setPending(
        mutations.filter(
          (item) => item.userId === userId && item.wardId === wardId && item.meetingId === meetingId && item.status !== 'failed'
        ).length
      );
    },
    [meetingId, userId, wardId]
  );

  const saveForOffline = useCallback(async () => {
    if (running.current || !navigator.onLine) {
      if (!navigator.onLine) setStatus('offline');
      return;
    }

    running.current = true;
    const generation = contextGeneration.current;
    const isCurrent = () => contextGeneration.current === generation;
    setStatus('saving');
    try {
      await ensureOfflineContext(userId, wardId);
      const authorizationResponse = await fetch('/api/me', { cache: 'no-store' });
      if (!authorizationResponse.ok) {
        if (!isCurrent()) return;
        await clearOfflineData();
        if (!isCurrent()) return;
        setSavedAt(null);
        setPending(0);
        setStatus('error');
        return;
      }
      const authorization = parseOfflineAuthorization(await authorizationResponse.json());
      if (!authorization || authorization.userId !== userId || authorization.wardId !== wardId) {
        if (!isCurrent()) return;
        await clearOfflineData();
        if (!isCurrent()) return;
        setSavedAt(null);
        setPending(0);
        setStatus('error');
        return;
      }
      const response = await fetch(`/api/w/${wardId}/meetings/${meetingId}/offline-snapshot`, {
        cache: 'no-store'
      });
      if (!response.ok) throw new Error('Snapshot request failed.');
      const payload = (await response.json()) as Omit<OfflineStandSnapshot, 'savedAt'>;
      const snapshot = { ...payload, savedAt: new Date().toISOString() };
      if (!isCurrent()) return;
      await saveOfflineSnapshot(snapshot);
      if (!isCurrent()) return;
      await cacheOfflinePage(meetingId);
      setSavedAt(snapshot.savedAt);
      setStatus('ready');
      await refreshPending(generation);
    } catch {
      if (isCurrent()) setStatus('error');
    } finally {
      running.current = false;
    }
  }, [meetingId, refreshPending, userId, wardId]);

  useEffect(() => {
    const generation = ++contextGeneration.current;
    setSavedAt(null);
    setPending(0);
    setStatus('checking');
    let cancelled = false;
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    void ensureOfflineContext(userId, wardId)
      .then(() => loadOfflineSnapshot(userId, wardId, meetingId))
      .then((snapshot) => {
        if (cancelled || contextGeneration.current !== generation) return;
        if (snapshot) setSavedAt(snapshot.savedAt);
        setStatus(navigator.onLine ? 'checking' : snapshot ? 'offline' : 'error');
      })
      .catch(() => undefined);
    void refreshPending(generation).catch(() => undefined);
    void saveForOffline();
    return () => {
      cancelled = true;
    };
  }, [meetingId, refreshPending, saveForOffline, userId, wardId]);

  async function deleteOfflineData() {
    if (!window.confirm(t('deleteConfirm'))) return;
    // Invalidate every in-flight snapshot fetch before clearing storage.
    contextGeneration.current += 1;
    setSavedAt(null);
    setPending(0);
    setStatus('checking');
    setClearing(true);
    try {
      await clearOfflineData();
      setSavedAt(null);
      setPending(0);
      setStatus('checking');
    } finally {
      setClearing(false);
    }
  }

  useEffect(() => {
    const refresh = () => void saveForOffline();
    const updateOfflineState = () => {
      if (!navigator.onLine) setStatus('offline');
      else void saveForOffline();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('online', updateOfflineState);
    window.addEventListener('offline', updateOfflineState);
    document.addEventListener('visibilitychange', onVisibility);
    const interval = window.setInterval(refresh, 5 * 60 * 1000);
    return () => {
      window.removeEventListener('online', updateOfflineState);
      window.removeEventListener('offline', updateOfflineState);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(interval);
    };
  }, [saveForOffline]);

  return (
    <div className="flex flex-wrap items-center gap-2" aria-live="polite">
      <span
        className={`rounded-full border px-3 py-1 text-xs font-medium ${status === 'offline' ? 'border-destructive text-destructive' : ''}`}
      >
        {statusLabel(status, pending, t)}
      </span>
      {savedAt ? <span className="text-xs text-muted-foreground">{t('savedAt', { date: new Date(savedAt).toLocaleString() })}</span> : null}
      {savedAt ? (
        <span className="text-xs text-muted-foreground" aria-label={`${t('offlineCopyAge')}: ${formatOfflineAge(savedAt)}`}>
          {getOfflineSnapshotAge(savedAt).isStale ? t('staleCopy') : formatOfflineAge(savedAt)}
        </span>
      ) : null}
      {status === 'error' ? (
        <Button type="button" size="sm" variant="outline" onClick={() => void saveForOffline()}>
          {t('retry')}
        </Button>
      ) : null}
      {savedAt ? (
        <Link className="text-sm underline" href={`/stand/${meetingId}/offline`}>
          {t('openCopy')}
        </Link>
      ) : null}
      <button type="button" className="text-sm underline" onClick={() => void deleteOfflineData()} disabled={clearing}>
        {clearing ? t('deletingData') : t('deleteData')}
      </button>
    </div>
  );
}
