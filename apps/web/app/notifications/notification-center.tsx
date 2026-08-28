'use client';

import * as React from 'react';

import { getNotificationEventDefinition, NOTIFICATION_CATEGORIES, type NotificationCategory } from '@/src/notifications/events';

type Notification = {
  id: string;
  eventType: string;
  category?: NotificationCategory;
  title: string;
  summary: string;
  details: unknown;
  severity: string;
  targetUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

type ListResponse = { notifications?: Notification[]; unreadCount?: number; error?: string };
const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  CALLINGS: 'Callings', MEMBERSHIP: 'Membership', MEETINGS: 'Meetings', NOTES: 'Notes and comments',
  ANNOUNCEMENTS: 'Announcements', CALENDAR: 'Calendar', ACCESS: 'Access and permissions', SYSTEM: 'System', REMINDERS: 'Reminders'
};

function relativeTime(value: string): string {
  const seconds = Math.round((Date.now() - Date.parse(value)) / 1000);
  if (!Number.isFinite(seconds)) return value;
  if (Math.abs(seconds) < 60) return 'Just now';
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return `${Math.abs(minutes)}m ago`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return `${Math.abs(hours)}h ago`;
  const days = Math.round(hours / 24);
  return `${Math.abs(days)}d ago`;
}

function categoryFor(notification: Notification): NotificationCategory {
  if (notification.category) return notification.category;
  try { return getNotificationEventDefinition(notification.eventType).category; } catch { return 'SYSTEM'; }
}

function detailEntries(details: unknown): Array<[string, string]> {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return [];
  return Object.entries(details as Record<string, unknown>)
    .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
    .map(([key, value]) => [key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`), String(value)]);
}

export function NotificationCenter({ wardId }: { wardId: string }) {
  const [filter, setFilter] = React.useState<'all' | 'unread'>('all');
  const [category, setCategory] = React.useState<NotificationCategory | ''>('');
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setStatus('loading'); setError(null);
    const params = new URLSearchParams({ filter });
    if (category) params.set('category', category);
    try {
      const response = await fetch(`/api/w/${wardId}/notifications?${params}`);
      const payload = await response.json() as ListResponse;
      if (!response.ok || !payload.notifications) throw new Error(payload.error ?? 'Unable to load notifications.');
      setNotifications(payload.notifications); setUnreadCount(payload.unreadCount ?? 0); setStatus('ready');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load notifications.'); setStatus('error');
    }
  }, [wardId, filter, category]);

  React.useEffect(() => { void load(); }, [load]);

  async function update(id: string, action: 'read' | 'dismiss') {
    const response = await fetch(`/api/w/${wardId}/notifications/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) });
    if (!response.ok) throw new Error('Unable to update notification.');
    if (action === 'dismiss') setNotifications((current) => current.filter((item) => item.id !== id));
    else setNotifications((current) => current.map((item) => item.id === id ? { ...item, readAt: new Date().toISOString() } : item));
    setUnreadCount((current) => action === 'read' ? Math.max(0, current - 1) : current);
  }

  async function toggleExpanded(notification: Notification) {
    const next = new Set(expanded);
    if (next.has(notification.id)) next.delete(notification.id); else {
      next.add(notification.id);
      if (!notification.readAt) { try { await update(notification.id, 'read'); } catch (updateError) { setError(updateError instanceof Error ? updateError.message : 'Unable to mark notification read.'); } }
    }
    setExpanded(next);
  }

  async function markAllRead() {
    try {
      const response = await fetch(`/api/w/${wardId}/notifications/mark-all-read`, { method: 'POST' });
      if (!response.ok) throw new Error('Unable to mark notifications read.');
      setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
      setUnreadCount(0);
    } catch (updateError) { setError(updateError instanceof Error ? updateError.message : 'Unable to mark notifications read.'); }
  }

  if (status === 'loading') return <p role="status">Loading notifications…</p>;
  if (status === 'error' && notifications.length === 0) return <div className="space-y-3" role="alert"><p>{error}</p><button className="rounded border px-3 py-2" onClick={() => void load()}>Try again</button></div>;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center gap-3">
      <label>Show <select className="rounded border bg-background px-2 py-1" value={filter} onChange={(event) => setFilter(event.target.value as 'all' | 'unread')}><option value="all">All</option><option value="unread">Unread</option></select></label>
      <label>Category <select className="rounded border bg-background px-2 py-1" value={category} onChange={(event) => setCategory(event.target.value as NotificationCategory | '')}><option value="">All categories</option>{NOTIFICATION_CATEGORIES.map((item) => <option key={item} value={item}>{CATEGORY_LABELS[item]}</option>)}</select></label>
      <button className="rounded border px-3 py-2" onClick={() => void markAllRead()} disabled={unreadCount === 0}>Mark all read</button>
      <span className="text-sm text-muted-foreground" aria-live="polite">{unreadCount} unread</span>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notifications.length === 0 ? <div className="rounded-lg border p-8 text-center"><h2 className="font-medium">No notifications</h2><p className="mt-1 text-sm text-muted-foreground">You’re all caught up.</p></div> : <div className="space-y-3">{notifications.map((notification) => { const isExpanded = expanded.has(notification.id); const isUnread = !notification.readAt; return <article key={notification.id} className={`rounded-lg border p-4 ${isUnread ? 'border-primary/50 bg-primary/5' : ''}`}><div className="flex items-start gap-3"><span aria-label={`${notification.severity} notification`} className="mt-1 text-xs font-medium uppercase text-muted-foreground">{CATEGORY_LABELS[categoryFor(notification)]}</span><div className="min-w-0 flex-1"><button className="text-left font-medium underline-offset-2 hover:underline" aria-expanded={isExpanded} onClick={() => void toggleExpanded(notification)}>{notification.title}</button><p className="mt-1 text-sm text-muted-foreground">{notification.summary}</p><p className="mt-2 text-xs text-muted-foreground">{relativeTime(notification.createdAt)}{isUnread ? ' · Unread' : ''}</p>{isExpanded && <div className="mt-3 space-y-2 border-t pt-3 text-sm">{detailEntries(notification.details).map(([key, value]) => <p key={key}><span className="font-medium capitalize">{key}:</span> {value}</p>)}{notification.targetUrl && <a className="inline-block underline" href={notification.targetUrl} onClick={() => { if (isUnread) void update(notification.id, 'read'); }}>Open related item</a>}</div>}</div><button className="text-sm underline" aria-label={`Dismiss ${notification.title}`} onClick={() => void update(notification.id, 'dismiss')}>Dismiss</button></div></article>; })}</div>}
  </div>;
}
