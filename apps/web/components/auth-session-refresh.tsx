'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

function sessionAccessKey(session: { user?: { roles?: string[] }; activeWardId?: string | null } | null) {
  return JSON.stringify({ roles: session?.user?.roles ?? [], activeWardId: session?.activeWardId ?? null });
}

export function AuthSessionRefresh() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const previousAccessKey = useRef(sessionAccessKey(session));

  const refreshSession = useCallback(async () => {
    if (!session?.user?.id) return;

    const refreshedSession = await update();
    const nextAccessKey = sessionAccessKey(refreshedSession);
    if (nextAccessKey !== previousAccessKey.current) {
      previousAccessKey.current = nextAccessKey;
      router.refresh();
    }
  }, [router, session?.user?.id, update]);

  useEffect(() => {
    void refreshSession();
    const interval = window.setInterval(() => void refreshSession(), 30_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refreshSession();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshSession]);

  return null;
}
