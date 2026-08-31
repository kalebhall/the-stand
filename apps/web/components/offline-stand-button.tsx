'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { saveOfflineSnapshot, type OfflineStandSnapshot } from '@/src/offline/storage';

export function OfflineStandButton({ wardId, meetingId }: { wardId: string; meetingId: string }) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);

  async function download() {
    setStatus('saving');
    try {
      const response = await fetch(`/api/w/${wardId}/meetings/${meetingId}/offline-snapshot`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Snapshot request failed.');
      const payload = await response.json() as Omit<OfflineStandSnapshot, 'savedAt'>;
      const snapshot = { ...payload, savedAt: new Date().toISOString() };
      await saveOfflineSnapshot(snapshot);
      if ('caches' in window) {
        await caches.open('the-stand-offline-v1').then((cache) => cache.add(`/stand/${meetingId}/offline`));
      }
      setSavedAt(snapshot.savedAt);
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" variant="outline" onClick={() => void download()} disabled={status === 'saving'}>
        {status === 'saving' ? 'Downloading…' : 'Download for offline use'}
      </Button>
      {status === 'saved' ? <Link className="text-sm underline" href={`/stand/${meetingId}/offline`}>Open offline copy</Link> : null}
      {status === 'saved' && savedAt ? <span className="text-xs text-muted-foreground">Saved {new Date(savedAt).toLocaleString()}</span> : null}
      {status === 'error' ? <span className="text-sm text-destructive">Unable to save offline copy.</span> : null}
    </div>
  );
}
