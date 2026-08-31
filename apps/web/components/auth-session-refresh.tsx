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
  const sessionRef = useRef(session);
  const updateRef = useRef(update);
  const routerRef = useRef(router);
  sessionRef.current = session;
  updateRef.current = update;
  routerRef.current = router;

  const refreshSession = useCallback(async () => {
    if (!sessionRef.current?.user?.id) return;

    const refreshedSession = await updateRef.current();
    const nextAccessKey = sessionAccessKey(refreshedSession);
    if (nextAccessKey !== previousAccessKey.current) {
      previousAccessKey.current = nextAccessKey;
      routerRef.current.refresh();
    }
  }, []);

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
