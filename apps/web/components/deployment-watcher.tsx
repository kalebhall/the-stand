'use client';

import { useEffect, useState } from 'react';

const POLL_INTERVAL_MS = 60_000;
const CLIENT_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? 'unknown';

export function DeploymentWatcher() {
  const [newVersionAvailable, setNewVersionAvailable] = useState(false);

  useEffect(() => {
    // Don't poll if we have no build ID to compare against
    if (CLIENT_BUILD_ID === 'unknown') return;

    const check = async () => {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { buildId?: string };
        if (data.buildId && data.buildId !== 'unknown' && data.buildId !== CLIENT_BUILD_ID) {
          setNewVersionAvailable(true);
        }
      } catch {
        // Network error — ignore, try again next tick
      }
    };

    const interval = setInterval(check, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  if (!newVersionAvailable) return null;

  return (
    <div className="mx-2 mb-2 rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-xs">
      <p className="font-semibold text-blue-700 dark:text-blue-300">Update available</p>
      <p className="text-muted-foreground mt-0.5">A new version was deployed.</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-1.5 rounded bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-700 transition-colors"
      >
        Refresh now
      </button>
    </div>
  );
}
