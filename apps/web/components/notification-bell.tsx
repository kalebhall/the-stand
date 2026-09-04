'use client';

import Link from 'next/link';
import * as React from 'react';

export function NotificationBell({ wardId }: { wardId: string | null | undefined }) {
  const [unreadCount, setUnreadCount] = React.useState(0);

  React.useEffect(() => {
    if (!wardId) return;
    const controller = new AbortController();
    void fetch(`/api/w/${wardId}/notifications?filter=unread&limit=1`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as { unreadCount?: number };
        setUnreadCount(typeof payload.unreadCount === 'number' ? payload.unreadCount : 0);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [wardId]);

  return (
    <Link
      href="/notifications"
      aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      <span aria-hidden="true" className="text-lg">
        🔔
      </span>
      {unreadCount > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 min-w-4 rounded-full bg-destructive px-1 text-center text-[10px] font-bold leading-4 text-destructive-foreground"
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Link>
  );
}
