'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { MemberAutocomplete } from '@/components/ui/member-autocomplete';

export type MembershipOrdinanceAction = {
  id: string;
  member_name: string;
  action_type: 'WELCOME_NEW_MEMBER' | 'BABY_BLESSING' | 'PRIESTHOOD_ORDINATION' | 'PRIESTHOOD_ADVANCEMENT';
  reason: string | null;
  details: string | null;
  status: 'pending' | 'action_needed' | 'completed';
};

type Props = {
  wardId: string;
  meetingId: string;
  actions: MembershipOrdinanceAction[];
  canManage: boolean;
  templates?: Partial<Record<MembershipOrdinanceAction['action_type'], string>>;
};

const OPTIONS = [
  ['WELCOME_NEW_MEMBER', 'Welcome new ward member'],
  ['BABY_BLESSING', 'Baby blessing'],
  ['PRIESTHOOD_ORDINATION', 'Priesthood ordination'],
  ['PRIESTHOOD_ADVANCEMENT', 'Priesthood advancement']
] as const;

const LABELS = Object.fromEntries(OPTIONS) as Record<MembershipOrdinanceAction['action_type'], string>;

function fillTemplate(template: string, action: MembershipOrdinanceAction) {
  return template.replaceAll('{memberName}', action.member_name).replaceAll('{callingName}', action.details?.trim() || 'the assigned office');
}

export function MembershipOrdinanceSection({ wardId, meetingId, actions, canManage, templates = {} }: Props) {
  const [actionType, setActionType] = useState<(typeof OPTIONS)[number][0]>('WELCOME_NEW_MEMBER');
  const [memberName, setMemberName] = useState('');
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createAction() {
    setBusy(true); setError(null);
    const response = await fetch(`/api/w/${wardId}/meetings/${meetingId}/membership-ordinances`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ actionType, memberName, reason, details }) });
    if (!response.ok) { setError('Unable to add membership or ordinance action.'); setBusy(false); return; }
    window.location.reload();
  }

  async function updateAction(id: string, status: 'announced' | 'completed') {
    setBusy(true); setError(null);
    const response = await fetch(`/api/w/${wardId}/meetings/${meetingId}/membership-ordinances/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }) });
    if (!response.ok) { setError('Unable to update action.'); setBusy(false); return; }
    window.location.reload();
  }

  return <section className="space-y-4 rounded-lg border bg-card p-4">
    <div><h2 className="text-lg font-semibold">Membership and Ordinances</h2><p className="text-sm text-muted-foreground">Welcome, blessing, and priesthood actions for this meeting.</p></div>
    {canManage ? <div className="grid gap-3 rounded-md border bg-background p-3 sm:grid-cols-2">
      <label className="space-y-1 text-sm"><span className="font-medium">Action</span><select className="w-full rounded-md border px-3 py-2" value={actionType} onChange={(e) => setActionType(e.target.value as typeof actionType)}>{OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="space-y-1 text-sm"><span className="font-medium">Member</span><MemberAutocomplete wardId={wardId} value={memberName} onChange={setMemberName} className="w-full rounded-md border px-3 py-2" placeholder="Name" /></label>
      {actionType === 'WELCOME_NEW_MEMBER' ? <label className="space-y-1 text-sm"><span className="font-medium">Reason</span><select className="w-full rounded-md border px-3 py-2" value={reason} onChange={(e) => setReason(e.target.value)}><option value="">Select reason</option><option value="RECENT_CONVERT">Recent convert</option><option value="RECORDS_RECEIVED">Records received</option></select></label> : null}
      {actionType !== 'WELCOME_NEW_MEMBER' ? <label className="space-y-1 text-sm"><span className="font-medium">Office or details</span><input className="w-full rounded-md border px-3 py-2" value={details} onChange={(e) => setDetails(e.target.value)} placeholder={actionType.includes('PRIESTHOOD') ? 'Deacon, Teacher, Priest, or Elder' : 'Optional details'} /></label> : null}
      <div className="flex items-end"><Button type="button" disabled={busy || !memberName.trim()} onClick={() => void createAction()}>Add action</Button></div>
    </div> : null}
    {error ? <p className="text-sm text-destructive">{error}</p> : null}
    {actions.length ? <ul className="space-y-2">{actions.map((action) => <li key={action.id} className="rounded-md border p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-wide text-muted-foreground">{LABELS[action.action_type]}</p><p className="font-semibold">{action.member_name}</p>{action.reason ? <p className="text-sm text-muted-foreground">{action.reason === 'RECORDS_RECEIVED' ? 'Records received' : 'Recent convert'}</p> : null}{action.details ? <p className="text-sm text-muted-foreground">{action.details}</p> : null}{templates[action.action_type] ? <p className="mt-2 whitespace-pre-wrap text-sm">{fillTemplate(templates[action.action_type]!, action)}</p> : null}</div><div className="flex items-center gap-2"><span className="rounded-full border px-2 py-1 text-xs">{action.status === 'action_needed' ? 'Action needed' : action.status[0].toUpperCase() + action.status.slice(1)}</span>{canManage && action.status === 'pending' ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void updateAction(action.id, 'announced')}>Mark announced</Button> : null}{canManage && action.status === 'action_needed' ? <Button size="sm" disabled={busy} onClick={() => void updateAction(action.id, 'completed')}>Mark completed</Button> : null}</div></div></li>)}</ul> : <p className="text-sm text-muted-foreground">No membership or ordinance actions added.</p>}
  </section>;
}
