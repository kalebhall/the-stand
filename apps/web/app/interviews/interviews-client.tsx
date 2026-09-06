'use client';

import { useCallback, useEffect, useState } from 'react';
import { buttonVariants } from '@/components/ui/button';
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
  const [type, setType] = useState('Membership or ordinance');
  const [member, setMember] = useState('');
  const [interviewer, setInterviewer] = useState('');
  const [when, setWhen] = useState('');
  const [error, setError] = useState('');
  const [online, setOnline] = useState(true);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loadedOffline, setLoadedOffline] = useState(false);

  const load = useCallback(async () => {
    setOnline(navigator.onLine);
    await ensureOfflineContext(userId, wardId);
    if (navigator.onLine) {
      try {
        const response = await fetch(`/api/w/${wardId}/interviews`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Unable to load interviews');
        const body = (await response.json()) as { interviews: Interview[] };
        const next = sortInterviews(body.interviews);
        const snapshot = { userId, wardId, interviews: next, savedAt: new Date().toISOString() };
        setItems(next);
        setSavedAt(snapshot.savedAt);
        setLoadedOffline(false);
        await saveOfflineInterviewSnapshot(snapshot);
        return;
      } catch {
        setError('Live interview schedule unavailable. Showing saved copy.');
      }
    }
    const cached = await loadOfflineInterviewSnapshot(userId, wardId);
    if (cached) {
      setItems(sortInterviews(cached.interviews));
      setSavedAt(cached.savedAt);
      setLoadedOffline(true);
    } else if (!navigator.onLine) {
      setError('No saved interview schedule available on this device.');
    }
  }, [userId, wardId]);

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
    };
  }, [load]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!online) return;
    setError('');
    const response = await fetch(`/api/w/${wardId}/interviews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ interviewType: type, memberName: member, interviewerName: interviewer, scheduledAt: new Date(when).toISOString() })
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? 'Could not schedule interview');
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
  }

  async function update(item: Interview, status: string) {
    if (!online) return;
    const response = await fetch(`/api/w/${wardId}/interviews/${item.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status })
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? 'Could not update interview');
      return;
    }
    const next = items.map((entry) => entry.id === item.id ? { ...entry, status, completed_at: body.interview?.completed_at ?? entry.completed_at } : entry);
    setItems(next);
    const snapshot = { userId, wardId, interviews: next, savedAt: new Date().toISOString() };
    setSavedAt(snapshot.savedAt);
    await saveOfflineInterviewSnapshot(snapshot);
  }

  return <div className="space-y-6">
    {loadedOffline || !online ? <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">Offline — showing saved interview schedule. Read-only; changes require connection.</div> : null}
    {savedAt ? <p className="text-xs text-muted-foreground">Saved copy: {new Date(savedAt).toLocaleString()}</p> : null}
    <section className="rounded-lg border bg-card p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Schedule interview</h2>
      <form onSubmit={create} className="mt-3 grid gap-2 sm:grid-cols-2">
        <input required disabled={!online} value={type} onChange={(e) => setType(e.target.value)} placeholder="Interview type" className="rounded-md border bg-background px-3 py-2 text-sm" />
        <input required disabled={!online} value={member} onChange={(e) => setMember(e.target.value)} placeholder="Member" className="rounded-md border bg-background px-3 py-2 text-sm" />
        <input required disabled={!online} value={interviewer} onChange={(e) => setInterviewer(e.target.value)} placeholder="Interviewer" className="rounded-md border bg-background px-3 py-2 text-sm" />
        <input required disabled={!online} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm" aria-label="Interview date and time" />
        <button disabled={!online} className={cn(buttonVariants({ size: 'sm' }))}>Schedule</button>
      </form>
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
    </section>
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Interview schedule</h2>
      {items.length ? items.map((item) => <article key={item.id} className="rounded-lg border bg-card p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{item.member_name}</h3><p className="text-sm text-muted-foreground">{item.interview_type} · {item.interviewer_name} · {new Date(item.scheduled_at).toLocaleString()}</p></div><select disabled={!online} value={item.status} onChange={(e) => void update(item, e.target.value)} className="rounded-md border bg-background px-2 py-1 text-sm" aria-label={`Status for ${item.member_name}`}>{INTERVIEW_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></div></article>) : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No interviews scheduled.</p>}
    </section>
  </div>;
}
