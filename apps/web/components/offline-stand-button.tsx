'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { listOfflineMutations, loadOfflineSnapshot, saveOfflineSnapshot, type OfflineStandSnapshot } from '@/src/offline/storage';

type OfflineStatus = 'checking' | 'saving' | 'ready' | 'offline' | 'error';

function statusLabel(status: OfflineStatus, pending: number): string {
  if (status === 'checking') return 'Checking offline readiness…';
  if (status === 'saving') return 'Saving for offline use…';
  if (status === 'offline') return 'Offline — showing saved meeting';
  if (status === 'error') return 'Unable to refresh offline copy';
  if (pending > 0) return `Ready offline · ${pending} change${pending === 1 ? '' : 's'} pending`;
  return 'Ready offline';
}

export function OfflineStandButton({ userId, wardId, meetingId }: { userId: string; wardId: string; meetingId: string }) {
  const [status, setStatus] = useState<OfflineStatus>('checking');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const running = useRef(false);

  const refreshPending = useCallback(async () => {
    const mutations = await listOfflineMutations();
    setPending(mutations.filter((item) => item.wardId === wardId && item.meetingId === meetingId).length);
  }, [meetingId, wardId]);

  const saveForOffline = useCallback(async () => {
    if (running.current || !navigator.onLine) {
      if (!navigator.onLine) setStatus('offline');
      return;
    }

    running.current = true;
    setStatus('saving');
    try {
      const response = await fetch(`/api/w/${wardId}/meetings/${meetingId}/offline-snapshot`, {
        cache: 'no-store'
      });
      if (!response.ok) throw new Error('Snapshot request failed.');
      const payload = (await response.json()) as Omit<OfflineStandSnapshot, 'savedAt'>;
      const snapshot = { ...payload, savedAt: new Date().toISOString() };
      await saveOfflineSnapshot(snapshot);
      if ('caches' in window) {
        await caches.open('the-stand-offline-v1').then((cache) => cache.add(`/stand/${meetingId}/offline`));
      }
      setSavedAt(snapshot.savedAt);
      setStatus('ready');
      await refreshPending();
    } catch {
      setStatus('error');
    } finally {
      running.current = false;
    }
  }, [meetingId, refreshPending, wardId]);

  useEffect(() => {
    let cancelled = false;
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    void loadOfflineSnapshot(userId, wardId, meetingId)
      .then((snapshot) => {
        if (cancelled) return;
        if (snapshot) setSavedAt(snapshot.savedAt);
        setStatus(navigator.onLine ? 'checking' : snapshot ? 'offline' : 'error');
      })
      .catch(() => undefined);
    void refreshPending().catch(() => undefined);
    void saveForOffline();
    return () => {
      cancelled = true;
    };
  }, [meetingId, refreshPending, saveForOffline, userId, wardId]);

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
        {statusLabel(status, pending)}
      </span>
      {savedAt ? <span className="text-xs text-muted-foreground">Saved {new Date(savedAt).toLocaleString()}</span> : null}
      {status === 'error' ? (
        <Button type="button" size="sm" variant="outline" onClick={() => void saveForOffline()}>
          Retry
        </Button>
      ) : null}
      {savedAt ? (
        <Link className="text-sm underline" href={`/stand/${meetingId}/offline`}>
          Open offline copy
        </Link>
      ) : null}
    </div>
  );
}
