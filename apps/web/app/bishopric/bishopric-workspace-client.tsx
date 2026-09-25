'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BISHOPRIC_ACTION_STATUSES, LEADERSHIP_MEETING_TYPES } from '@/src/leadership/bishopric';

type Meeting = { id: string; meeting_date: string; meeting_type: string; agenda_template: string; status: string; action_count: number; open_action_count: number };
type Action = { id: string; bishopric_meeting_id: string; title: string; details: string | null; decision: string | null; owner_name: string | null; due_date: string | null; status: string; carry_forward: boolean; meeting_date: string; member_id: string | null; linked_member_name: string | null; calling_assignment_id: string | null; linked_calling_name: string | null; linked_membership_action_id: string | null };
type Member = { id: string; fullName: string };
type Calling = { id: string; memberName: string; callingName: string };
type LeadershipNote = { id: string; note_text: string; visibility: string; created_at: string; created_by_name: string | null };

type MeetingType = (typeof LEADERSHIP_MEETING_TYPES)[number];

export function BishopricWorkspaceClient({ wardId, initialMeetings, initialActions, defaultMeetingType = 'BISHOPRIC' }: { wardId: string; initialMeetings: Meeting[]; initialActions: Action[]; defaultMeetingType?: MeetingType }) {
  const t = useTranslations('bishopric');
  const [meetings, setMeetings] = useState(initialMeetings);
  const [actions, setActions] = useState(initialActions);
  const [date, setDate] = useState('');
  const [meetingType, setMeetingType] = useState<MeetingType>(defaultMeetingType);
  const [selectedMeeting, setSelectedMeeting] = useState(initialMeetings[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [memberId, setMemberId] = useState('');
  const [callingAssignmentId, setCallingAssignmentId] = useState('');
  const [noteText, setNoteText] = useState('');
  const [notesByAction, setNotesByAction] = useState<Record<string, LeadershipNote[]>>({});
  const [members, setMembers] = useState<Member[]>([]);
  const [callings, setCallings] = useState<Calling[]>([]);
  const [error, setError] = useState('');

  const meetingLabel = (type: string) => t(`meetingTypes.${type}`);
  const statusLabel = (status: string) => t(`statuses.${status}`);

  useEffect(() => {
    void Promise.all([
      fetch(`/api/w/${wardId}/members?limit=100`).then((response) => response.json()),
      fetch(`/api/w/${wardId}/callings`).then((response) => response.json())
    ]).then(([memberBody, callingBody]) => {
      setMembers(memberBody.members ?? []);
      setCallings(callingBody.callings ?? []);
    }).catch(() => setError(t('errors.loadLinks')));
  }, [t, wardId]);

  useEffect(() => {
    void Promise.all(initialActions.map(async (action) => {
      const response = await fetch(`/api/w/${wardId}/notes?bishopricActionId=${action.id}`);
      const body = await response.json();
      return [action.id, body.notes ?? []] as const;
    })).then((entries) => setNotesByAction(Object.fromEntries(entries))).catch(() => setError(t('errors.loadNotes')));
  }, [initialActions, t, wardId]);

  async function createMeeting(event: React.FormEvent) {
    event.preventDefault(); setError('');
    const response = await fetch(`/api/w/${wardId}/bishopric`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ meetingDate: date, meetingType, agendaTemplate: meetingType === 'BISHOPRIC' ? 'BISHOPRIC' : meetingType }) });
    const body = await response.json();
    if (!response.ok) { setError(body.error ?? t('errors.createMeeting')); return; }
    setMeetings((current) => [body.meeting, ...current]); setSelectedMeeting(body.meeting.id); setDate('');
  }

  async function createAction(event: React.FormEvent) {
    event.preventDefault(); setError('');
    if (!selectedMeeting) { setError(t('errors.selectMeeting')); return; }
    const response = await fetch(`/api/w/${wardId}/bishopric/${selectedMeeting}/actions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, ownerName: owner, dueDate, memberId: memberId || undefined, callingAssignmentId: callingAssignmentId || undefined }) });
    const body = await response.json();
    if (!response.ok) { setError(body.error ?? t('errors.createAction')); return; }
    setActions((current) => [{ ...body.action, meeting_date: meetings.find((meeting) => meeting.id === selectedMeeting)?.meeting_date ?? '' }, ...current]); setTitle(''); setOwner(''); setDueDate(''); setMemberId(''); setCallingAssignmentId('');
  }

  async function createNote(action: Action) {
    setError('');
    if (!noteText.trim()) { setError(t('errors.emptyNote')); return; }
    const response = await fetch(`/api/w/${wardId}/notes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ target: { type: 'BISHOPRIC_ACTION', bishopricActionId: action.id }, visibility: 'LEADERSHIP', noteText }) });
    const body = await response.json();
    if (!response.ok) { setError(body.error ?? t('errors.saveNote')); return; }
    setNoteText('');
    setNotesByAction((current) => ({ ...current, [action.id]: [{ id: body.id, note_text: noteText.trim(), visibility: 'LEADERSHIP', created_at: body.createdAt, created_by_name: t('leader') }, ...(current[action.id] ?? [])] }));
  }

  async function updateAction(action: Action, status: string) {
    const response = await fetch(`/api/w/${wardId}/bishopric/${action.bishopric_meeting_id}/actions/${action.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }) });
    const body = await response.json();
    if (!response.ok) { setError(body.error ?? t('errors.updateAction')); return; }
    setActions((current) => status === 'COMPLETED' ? current.filter((item) => item.id !== action.id) : current.map((item) => item.id === action.id ? { ...item, status } : item));
  }

  return <div className="space-y-6">
    <section className="rounded-lg border bg-card p-5 shadow-sm">
      <h2 className="text-lg font-semibold">{t('newMeeting', { meetingType: meetingLabel(meetingType) })}</h2>
      <form onSubmit={createMeeting} className="mt-3 flex flex-wrap gap-2">
        <select value={meetingType} onChange={(event) => setMeetingType(event.target.value as MeetingType)} className="rounded-md border bg-background px-3 py-2 text-sm" aria-label={t('leadershipMeetingType')}>{LEADERSHIP_MEETING_TYPES.map((type) => <option key={type} value={type}>{meetingLabel(type)}</option>)}</select>
        <input required type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm" aria-label={t('meetingDate')} />
        <button className={cn(buttonVariants({ size: 'sm' }))}>{t('createMeeting')}</button>
      </form>
    </section>
    <section className="rounded-lg border bg-card p-5 shadow-sm">
      <h2 className="text-lg font-semibold">{t('addPrivateAction')}</h2>
      <form onSubmit={createAction} className="mt-3 grid gap-2 sm:grid-cols-2">
        <select required value={selectedMeeting} onChange={(event) => setSelectedMeeting(event.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm" aria-label={t('leadershipMeeting')}><option value="">{t('selectMeeting')}</option>{meetings.map((meeting) => <option key={meeting.id} value={meeting.id}>{meeting.meeting_date} · {meetingLabel(meeting.agenda_template)}</option>)}</select>
        <input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t('actionOrAssignment')} className="rounded-md border bg-background px-3 py-2 text-sm" />
        <input value={owner} onChange={(event) => setOwner(event.target.value)} placeholder={t('owner')} className="rounded-md border bg-background px-3 py-2 text-sm" />
        <select value={memberId} onChange={(event) => setMemberId(event.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm" aria-label={t('linkedMember')}><option value="">{t('noLinkedMember')}</option>{members.map((member) => <option key={member.id} value={member.id}>{member.fullName}</option>)}</select>
        <select value={callingAssignmentId} onChange={(event) => setCallingAssignmentId(event.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm" aria-label={t('linkedCalling')}><option value="">{t('noLinkedCalling')}</option>{callings.map((calling) => <option key={calling.id} value={calling.id}>{calling.memberName} · {calling.callingName}</option>)}</select>
        <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm" aria-label={t('dueDate')} />
        <button className={cn(buttonVariants({ size: 'sm' }))}>{t('addPrivateAction')}</button>
      </form>
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
    </section>
    <section className="space-y-3"><h2 className="text-lg font-semibold">{t('openActions')}</h2>
      {actions.length ? actions.map((action) => <article key={action.id} className="rounded-lg border bg-card p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{action.title}</h3><p className="text-sm text-muted-foreground">{t('meeting')} {action.meeting_date}{action.owner_name ? ` · ${t('ownerLabel')}: ${action.owner_name}` : ''}{action.linked_member_name ? ` · ${t('memberLabel')}: ${action.linked_member_name}` : ''}{action.linked_calling_name ? ` · ${t('callingLabel')}: ${action.linked_calling_name}` : ''}{action.linked_membership_action_id ? ` · ${t('linkedMembershipFollowUp')}` : ''}{action.due_date ? ` · ${t('dueLabel')}: ${action.due_date}` : ''}</p></div><select value={action.status} onChange={(event) => void updateAction(action, event.target.value)} className="rounded-md border bg-background px-2 py-1 text-sm" aria-label={t('statusFor', { title: action.title })}>{BISHOPRIC_ACTION_STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></div><form onSubmit={(event) => { event.preventDefault(); void createNote(action); }} className="mt-3 flex gap-2"><label className="sr-only" htmlFor={`leadership-note-${action.id}`}>{t('restrictedLeadershipNoteFor', { title: action.title })}</label><input id={`leadership-note-${action.id}`} value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder={t('restrictedLeadershipNote')} className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm" /><button type="submit" className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}>{t('addNote')}</button></form>{notesByAction[action.id]?.length ? <div className="mt-3 space-y-2 border-t pt-3"><h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('restrictedNotes')}</h4>{notesByAction[action.id].map((note) => <p key={note.id} className="rounded-md bg-muted/50 p-2 text-sm"><span className="font-medium">{note.created_by_name ?? t('leader')}</span>: {note.note_text}</p>)}</div> : null}</article>) : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t('noOpenActions')}</p>}
    </section>
  </div>;
}
