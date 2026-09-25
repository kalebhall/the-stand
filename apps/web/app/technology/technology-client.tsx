'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Meeting = { id: string; meeting_date: string; meeting_type: string };
type Checklist = { owner_name: string | null; room_ready: boolean; audio_ready: boolean; stream_ready: boolean; accessibility_checked: boolean; authorized_link: string | null; recording_deletion_reminder: boolean; start_confirmed_at: string | null; stop_confirmed_at: string | null };
type ChecklistField = { name: string; label: string; checked: boolean };

export function TechnologyClient({ wardId, meetings }: { wardId: string; meetings: Meeting[] }) {
  const t = useTranslations('technology');
  const [meetingId, setMeetingId] = useState(meetings[0]?.id ?? '');
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const selected = meetings.find((meeting) => meeting.id === meetingId);
  const fields: ChecklistField[] = [
    { name: 'roomReady', label: t('roomReady'), checked: Boolean(checklist?.room_ready) },
    { name: 'audioReady', label: t('audioReady'), checked: Boolean(checklist?.audio_ready) },
    { name: 'streamReady', label: t('streamReady'), checked: Boolean(checklist?.stream_ready) },
    { name: 'accessibilityChecked', label: t('accessibilityChecked'), checked: Boolean(checklist?.accessibility_checked) },
    { name: 'recordingDeletionReminder', label: t('recordingDeletionReminder'), checked: Boolean(checklist?.recording_deletion_reminder) },
    { name: 'startConfirmed', label: t('startConfirmed'), checked: Boolean(checklist?.start_confirmed_at) },
    { name: 'stopConfirmed', label: t('stopConfirmed'), checked: Boolean(checklist?.stop_confirmed_at) }
  ];

  async function load(id: string) {
    setMeetingId(id); setLoaded(false); setError('');
    const response = await fetch(`/api/w/${wardId}/meetings/${id}/technology`);
    const body = await response.json();
    if (!response.ok) { setError(body.error ?? t('errors.load')); return; }
    setChecklist(body.checklist ?? { owner_name: '', room_ready: false, audio_ready: false, stream_ready: false, accessibility_checked: false, authorized_link: '', recording_deletion_reminder: false, start_confirmed_at: null, stop_confirmed_at: null });
    setLoaded(true);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const form = new FormData(event.currentTarget);
    const payload = { ownerName: form.get('ownerName'), authorizedLink: form.get('authorizedLink'), roomReady: form.get('roomReady') === 'on', audioReady: form.get('audioReady') === 'on', streamReady: form.get('streamReady') === 'on', accessibilityChecked: form.get('accessibilityChecked') === 'on', recordingDeletionReminder: form.get('recordingDeletionReminder') === 'on', startConfirmed: form.get('startConfirmed') === 'on', stopConfirmed: form.get('stopConfirmed') === 'on' };
    const response = await fetch(`/api/w/${wardId}/meetings/${meetingId}/technology`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const body = await response.json();
    if (!response.ok) { setError(body.error ?? t('errors.save')); return; }
    setChecklist(body.checklist);
  }

  return <div className="space-y-4">
    {meetings.length ? <select value={meetingId} onChange={(event) => void load(event.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm" aria-label={t('meeting')}>{meetings.map((meeting) => <option key={meeting.id} value={meeting.id}>{meeting.meeting_date} · {meeting.meeting_type}</option>)}</select> : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t('noMeetings')}</p>}
    {meetingId && !loaded ? <button type="button" onClick={() => void load(meetingId)} className={cn(buttonVariants({ variant: 'outline' }))}>{t('loadChecklist')}</button> : null}
    {checklist && selected ? <form onSubmit={save} className="grid gap-3 rounded-lg border bg-card p-5 sm:grid-cols-2"><p className="sm:col-span-2 text-sm text-muted-foreground">{selected.meeting_date} · {selected.meeting_type}. {t('neverStoreCredentials')}</p><input name="ownerName" defaultValue={checklist.owner_name ?? ''} placeholder={t('checklistOwner')} className="rounded-md border bg-background px-3 py-2 text-sm"/><input name="authorizedLink" defaultValue={checklist.authorized_link ?? ''} placeholder={t('authorizedStreamLink')} className="rounded-md border bg-background px-3 py-2 text-sm"/>{fields.map((field) => <label key={field.name} className="flex items-center gap-2 text-sm"><input type="checkbox" name={field.name} defaultChecked={field.checked}/>{field.label}</label>)}<button className={cn(buttonVariants({ size: 'sm' }))}>{t('saveChecklist')}</button></form> : null}
    {error ? <p className="text-sm text-destructive">{error}</p> : null}
  </div>;
}
