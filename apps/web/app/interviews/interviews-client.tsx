'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { buttonVariants } from '@/components/ui/button';
import { MemberAutocomplete } from '@/components/ui/member-autocomplete';
import { cn } from '@/lib/utils';
import { INTERVIEW_STATUSES } from '@/src/leadership/interviews';
import {
  ensureOfflineContext,
  loadOfflineInterviewSnapshot,
  saveOfflineInterviewSnapshot,
  type OfflineInterview
} from '@/src/offline/storage';

type Interview = OfflineInterview;

function sortInterviews(items: Interview[]): Interview[] {
  return [...items].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
}

export function InterviewsClient({ wardId, userId, initial }: { wardId: string; userId: string; initial: Interview[] }) {
  const [items, setItems] = useState(sortInterviews(initial));
  const t = useTranslations('interviews');
  const locale = useLocale();
  const [type, setType] = useState(t('defaultInterviewType'));
  const [member, setMember] = useState('');
  const [interviewer, setInterviewer] = useState('');
  const [when, setWhen] = useState('');
  const [error, setError] = useState('');
  const [online, setOnline] = useState(true);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loadedOffline, setLoadedOffline] = useState(false);
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  const [subscriptionMessage, setSubscriptionMessage] = useState('');
  const contextGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = contextGeneration.current;
    const isCurrent = () => contextGeneration.current === generation;
    setOnline(navigator.onLine);
    await ensureOfflineContext(userId, wardId);
    if (!isCurrent()) return;
    if (navigator.onLine) {
      try {
        const response = await fetch(`/api/w/${wardId}/interviews`, { cache: 'no-store' });
        if (!response.ok) throw new Error(t('errors.load'));
        const body = (await response.json()) as { interviews: Interview[] };
        if (!isCurrent()) return;
        const subscriptionResponse = await fetch(`/api/w/${wardId}/interviews/calendar-subscription`, { cache: 'no-store' });
        if (subscriptionResponse.ok) {
          const subscriptionBody = (await subscriptionResponse.json()) as { subscription: { id: string } | null };
          if (!isCurrent()) return;
          setSubscriptionActive(Boolean(subscriptionBody.subscription));
        }
        const next = sortInterviews(body.interviews);
        const snapshot = { userId, wardId, interviews: next, savedAt: new Date().toISOString() };
        if (!isCurrent()) return;
        setItems(next);
        setSavedAt(snapshot.savedAt);
        setLoadedOffline(false);
        await saveOfflineInterviewSnapshot(snapshot);
        return;
      } catch {
        if (isCurrent()) setError(t('errors.load'));
      }
    }
    const cached = await loadOfflineInterviewSnapshot(userId, wardId);
    if (!isCurrent()) return;
    if (cached && cached.userId === userId && cached.wardId === wardId) {
      setItems(sortInterviews(cached.interviews));
      setSavedAt(cached.savedAt);
      setLoadedOffline(true);
    } else if (!navigator.onLine) {
      setError(t('errors.offlineEmpty'));
    }
  }, [t, userId, wardId]);

  useEffect(() => {
    contextGeneration.current += 1;
    setItems([]);
    setSavedAt(null);
    setLoadedOffline(false);
    setSubscriptionActive(false);
    setFeedUrl(null);
    setSubscriptionMessage('');
    setError('');
    const clear = () => {
      contextGeneration.current += 1;
      setItems([]);
      setSavedAt(null);
      setLoadedOffline(false);
      setSubscriptionActive(false);
      setFeedUrl(null);
      setSubscriptionMessage('');
      setError('');
      setMember('');
      setInterviewer('');
      setWhen('');
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'the-stand-offline-deletion-pending') clear();
    };
    contextGeneration.current += 1;
    void load();
    const refresh = () => void load();
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    window.addEventListener('offline-data-cleared', clear);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
      window.removeEventListener('offline-data-cleared', clear);
      window.removeEventListener('storage', onStorage);
    };
  }, [load]);

  async function createSubscription() {
    const generation = contextGeneration.current;
    const isCurrent = () => contextGeneration.current === generation;
    if (!online) return;
    setSubscriptionMessage('');
    const response = await fetch(`/api/w/${wardId}/interviews/calendar-subscription`, { method: 'POST' });
    const body = await response.json();
    if (!isCurrent()) return;
    if (!response.ok) {
      setSubscriptionMessage(body.error ?? t('errors.createSubscription'));
      return;
    }
    setSubscriptionActive(true);
    setFeedUrl(body.feedUrl);
    setSubscriptionMessage(t('subscriptionCreated'));
  }

  async function revokeSubscription() {
    const generation = contextGeneration.current;
    const isCurrent = () => contextGeneration.current === generation;
    if (!online) return;
    const response = await fetch(`/api/w/${wardId}/interviews/calendar-subscription`, { method: 'DELETE' });
    if (!response.ok) {
      const body = await response.json();
      if (!isCurrent()) return;
      setSubscriptionMessage(body.error ?? t('errors.revokeSubscription'));
      return;
    }
    if (!isCurrent()) return;
    setSubscriptionActive(false);
    setFeedUrl(null);
    setSubscriptionMessage(t('subscriptionRevoked'));
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const generation = contextGeneration.current;
    const isCurrent = () => contextGeneration.current === generation;
    if (!online) return;

    const missingFields = [
      !type.trim() ? t('fields.interviewType') : null,
      !member.trim() ? t('fields.member') : null,
      !interviewer.trim() ? t('fields.interviewer') : null,
      !when ? t('fields.dateTime') : null
    ].filter((field): field is string => field !== null);

    if (missingFields.length > 0) {
      setError(t('errors.completeRequired', { fields: missingFields.join(', ') }));
      return;
    }

    const scheduledAt = new Date(when);
    if (Number.isNaN(scheduledAt.getTime())) {
      setError(t('errors.invalidDate'));
      return;
    }

    setError('');
    const response = await fetch(`/api/w/${wardId}/interviews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ interviewType: type, memberName: member, interviewerName: interviewer, scheduledAt: scheduledAt.toISOString() })
    });
    const body = await response.json();
    if (!isCurrent()) return;
    if (!response.ok) {
      setError(body.error ?? t('errors.schedule'));
      return;
    }
    const next = sortInterviews([...items, body.interview]);
    setItems(next);
    setMember('');
    setInterviewer('');
    setWhen('');
    const snapshot = { userId, wardId, interviews: next, savedAt: new Date().toISOString() };
    setSavedAt(snapshot.savedAt);
    await saveOfflineInterviewSnapshot(snapshot);
    if (!isCurrent()) return;
  }

  async function update(item: Interview, status: string) {
    const generation = contextGeneration.current;
    const isCurrent = () => contextGeneration.current === generation;
    if (!online) return;
    const response = await fetch(`/api/w/${wardId}/interviews/${item.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status })
    });
    const body = await response.json();
    if (!isCurrent()) return;
    if (!response.ok) {
      setError(body.error ?? t('errors.update'));
      return;
    }
    const next = items.map((entry) => entry.id === item.id ? { ...entry, status, completed_at: body.interview?.completed_at ?? entry.completed_at } : entry);
    setItems(next);
    const snapshot = { userId, wardId, interviews: next, savedAt: new Date().toISOString() };
    setSavedAt(snapshot.savedAt);
    await saveOfflineInterviewSnapshot(snapshot);
  }

  return <div className="space-y-6">
    {loadedOffline || !online ? <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">{t('offlineNotice')}</div> : null}
    {savedAt ? <p className="text-xs text-muted-foreground">{t('savedCopy', { date: new Date(savedAt).toLocaleString(locale) })}</p> : null}
    <section className="rounded-lg border bg-card p-5 shadow-sm">
      <h2 className="text-lg font-semibold">{t('calendarSubscription')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('calendarSubscriptionDescription')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={!online} onClick={() => void createSubscription()} className={cn(buttonVariants({ size: 'sm' }))}>{subscriptionActive ? t('rotateSubscriptionUrl') : t('createSubscriptionUrl')}</button>
        {subscriptionActive ? <button type="button" disabled={!online} onClick={() => void revokeSubscription()} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>{t('revokeUrl')}</button> : null}
      </div>
      {feedUrl ? <div className="mt-3 space-y-1"><label htmlFor="interview-calendar-feed-url" className="text-sm font-medium">{t('newCalendarUrl')}</label><input id="interview-calendar-feed-url" readOnly value={feedUrl} className="w-full rounded-md border bg-muted px-3 py-2 text-sm" /></div> : null}
      {subscriptionMessage ? <p role="status" className="mt-2 text-sm text-muted-foreground">{subscriptionMessage}</p> : null}
    </section>
    <section className="rounded-lg border bg-card p-5 shadow-sm">
      <h2 className="text-lg font-semibold">{t('scheduleInterview')}</h2>
      <form onSubmit={create} noValidate className="mt-3 grid gap-2 sm:grid-cols-2">
        <input required disabled={!online} value={type} onChange={(e) => setType(e.target.value)} placeholder={t('interviewType')} className="rounded-md border bg-background px-3 py-2 text-sm" />
        <MemberAutocomplete
          wardId={wardId}
          value={member}
          onChange={setMember}
          placeholder={t('searchMember')}
          disabled={!online}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
        <input required disabled={!online} value={interviewer} onChange={(e) => setInterviewer(e.target.value)} placeholder={t('interviewer')} className="rounded-md border bg-background px-3 py-2 text-sm" />
        <input required disabled={!online} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm" aria-label={t('interviewDateTime')} />
        <button disabled={!online} className={cn(buttonVariants({ size: 'sm' }))}>{t('schedule')}</button>
      </form>
      {error ? <p role="alert" className="mt-2 text-sm text-destructive">{error}</p> : null}
    </section>
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{t('interviewSchedule')}</h2>
      {items.length ? items.map((item) => <article key={item.id} className="rounded-lg border bg-card p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{item.member_name}</h3><p className="text-sm text-muted-foreground">{item.interview_type} · {item.interviewer_name} · {new Date(item.scheduled_at).toLocaleString(locale)}</p></div><select disabled={!online} value={item.status} onChange={(e) => void update(item, e.target.value)} className="rounded-md border bg-background px-2 py-1 text-sm" aria-label={t('statusFor', { member: item.member_name })}>{INTERVIEW_STATUSES.map((status) => <option key={status} value={status}>{t(`statuses.${status}`)}</option>)}</select></div></article>) : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t('noInterviews')}</p>}
    </section>
  </div>;
}
