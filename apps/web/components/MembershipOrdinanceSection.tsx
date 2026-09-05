'use client';

import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { MemberAutocomplete } from '@/components/ui/member-autocomplete';
import { PRIESTHOOD_OFFICE_LABELS, type PriesthoodOffice } from '@/src/church-actions/membership-ordinance';

export type MembershipOrdinanceAction = {
  id: string;
  member_name: string;
  action_type: 'WELCOME_NEW_MEMBER' | 'BABY_BLESSING' | 'PRIESTHOOD_ORDINATION' | 'PRIESTHOOD_ADVANCEMENT';
  priesthood_office?: PriesthoodOffice | null;
  reason: string | null;
  details: string | null;
  status: 'pending' | 'action_needed' | 'completed';
  planned_date?: string | null;
  interview_status?: 'not_required' | 'needed' | 'scheduled' | 'completed';
  interview_date?: string | null;
  interviewer_name?: string | null;
  approval_confirmed?: boolean;
  presenting_leader?: string | null;
  performing_priesthood_holder?: string | null;
  ordinance_date?: string | null;
  responsible_leader?: string | null;
  lcr_follow_up_status?: 'not_applicable' | 'needed' | 'completed';
  lcr_updated_at?: string | null;
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
  return template
    .replaceAll('{memberName}', action.member_name)
    .replaceAll('{callingName}', action.details?.trim() || 'the assigned office');
}

export function MembershipOrdinanceSection({ wardId, meetingId, actions, canManage, templates = {} }: Props) {
  const [actionType, setActionType] = useState<(typeof OPTIONS)[number][0]>('WELCOME_NEW_MEMBER');
  const [memberName, setMemberName] = useState('');
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [priesthoodOffice, setPriesthoodOffice] = useState<PriesthoodOffice | ''>('');
  const [plannedDate, setPlannedDate] = useState('');
  const [interviewDate, setInterviewDate] = useState('');
  const [interviewerName, setInterviewerName] = useState('');
  const [responsibleLeader, setResponsibleLeader] = useState('');
  const [approvalConfirmed, setApprovalConfirmed] = useState(false);
  const [presentingLeader, setPresentingLeader] = useState('');
  const [performingPriesthoodHolder, setPerformingPriesthoodHolder] = useState('');
  const [ordinanceDate, setOrdinanceDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createAction() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/w/${wardId}/meetings/${meetingId}/membership-ordinances`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actionType, memberName, reason, details, priesthoodOffice: priesthoodOffice || null, plannedDate, interviewDate, interviewerName, approvalConfirmed, presentingLeader, performingPriesthoodHolder, ordinanceDate, responsibleLeader })
    });
    if (!response.ok) {
      setError('Unable to add membership or ordinance action.');
      setBusy(false);
      return;
    }
    window.location.reload();
  }

  async function updateAction(id: string, status: 'announced' | 'completed' | 'interview_completed' | 'lcr_completed') {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/w/${wardId}/meetings/${meetingId}/membership-ordinances/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (!response.ok) {
      setError('Unable to update action.');
      setBusy(false);
      return;
    }
    window.location.reload();
  }

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-md bg-muted/40 p-3">
        <div>
          <h2 className="text-lg font-semibold">Membership and Ordinances</h2>
          <p className="text-sm text-muted-foreground">Welcome, blessing, and priesthood actions for this meeting.</p>
        </div>
        <Link href="/membership-ordinances" className="text-sm font-medium underline underline-offset-4">
          Open workspace
        </Link>
      </div>
      {canManage ? (
        <div className="grid gap-3 rounded-md border bg-background p-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Action</span>
            <select
              className="w-full rounded-md border px-3 py-2"
              value={actionType}
              onChange={(e) => setActionType(e.target.value as typeof actionType)}
            >
              {OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Member</span>
            <MemberAutocomplete
              wardId={wardId}
              value={memberName}
              onChange={setMemberName}
              className="w-full rounded-md border px-3 py-2"
              placeholder="Name"
            />
          </label>
          {actionType === 'WELCOME_NEW_MEMBER' ? (
            <label className="space-y-1 text-sm">
              <span className="font-medium">Reason</span>
              <select className="w-full rounded-md border px-3 py-2" value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">Select reason</option>
                <option value="RECENT_CONVERT">Recent convert</option>
                <option value="RECORDS_RECEIVED">Records received</option>
              </select>
            </label>
          ) : null}
          {actionType !== 'WELCOME_NEW_MEMBER' ? (
            <label className="space-y-1 text-sm">
              <span className="font-medium">Office or details</span>
              <input
                className="w-full rounded-md border px-3 py-2"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder={actionType.includes('PRIESTHOOD') ? 'Deacon, Teacher, Priest, or Elder' : 'Optional details'}
              />
            </label>
          ) : null}
          {actionType.includes('PRIESTHOOD') ? (
            <>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Priesthood office</span>
                <select className="w-full rounded-md border px-3 py-2" value={priesthoodOffice} onChange={(e) => setPriesthoodOffice(e.target.value as PriesthoodOffice | '')}>
                  <option value="">Select office</option>
                  {Object.entries(PRIESTHOOD_OFFICE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 self-end text-sm">
                <input type="checkbox" checked={approvalConfirmed} onChange={(e) => setApprovalConfirmed(e.target.checked)} />
                Approval confirmed
              </label>
              <label className="space-y-1 text-sm"><span className="font-medium">Presenting leader</span><input className="w-full rounded-md border px-3 py-2" value={presentingLeader} onChange={(e) => setPresentingLeader(e.target.value)} /></label>
              <label className="space-y-1 text-sm"><span className="font-medium">Performing priesthood holder</span><input className="w-full rounded-md border px-3 py-2" value={performingPriesthoodHolder} onChange={(e) => setPerformingPriesthoodHolder(e.target.value)} /></label>
              <label className="space-y-1 text-sm"><span className="font-medium">Ordinance date</span><input className="w-full rounded-md border px-3 py-2" type="date" value={ordinanceDate} onChange={(e) => setOrdinanceDate(e.target.value)} /></label>
            </>
          ) : null}
          <label className="space-y-1 text-sm">
            <span className="font-medium">Planned date</span>
            <input
              className="w-full rounded-md border px-3 py-2"
              type="date"
              value={plannedDate}
              onChange={(e) => setPlannedDate(e.target.value)}
            />
          </label>
          {actionType.includes('PRIESTHOOD') ? (
            <>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Interview date</span>
                <input
                  className="w-full rounded-md border px-3 py-2"
                  type="date"
                  value={interviewDate}
                  onChange={(e) => setInterviewDate(e.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Interviewer</span>
                <input
                  className="w-full rounded-md border px-3 py-2"
                  value={interviewerName}
                  onChange={(e) => setInterviewerName(e.target.value)}
                  placeholder="Name"
                />
              </label>
            </>
          ) : null}
          <label className="space-y-1 text-sm">
            <span className="font-medium">Responsible leader</span>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={responsibleLeader}
              onChange={(e) => setResponsibleLeader(e.target.value)}
              placeholder="Name"
            />
          </label>
          <div className="flex items-end">
            <Button type="button" disabled={busy || !memberName.trim()} onClick={() => void createAction()}>
              Add action
            </Button>
          </div>
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {actions.length ? (
        <ul className="space-y-2">
          {actions.map((action) => (
            <li key={action.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{LABELS[action.action_type]}</p>
                  <p className="font-semibold">{action.member_name}</p>
                  {action.reason ? (
                    <p className="text-sm text-muted-foreground">
                      {action.reason === 'RECORDS_RECEIVED' ? 'Records received' : 'Recent convert'}
                    </p>
                  ) : null}
                  {action.details ? <p className="text-sm text-muted-foreground">{action.details}</p> : null}
                  {action.action_type.includes('PRIESTHOOD') && action.priesthood_office ? <p className="text-sm text-muted-foreground">Office: {PRIESTHOOD_OFFICE_LABELS[action.priesthood_office]}</p> : null}
                  {canManage && action.action_type.includes('PRIESTHOOD') ? <p className="text-sm text-muted-foreground">Approval: {action.approval_confirmed ? 'confirmed' : 'not confirmed'}</p> : null}
                  {canManage && action.planned_date ? (
                    <p className="text-sm text-muted-foreground">Planned: {action.planned_date}</p>
                  ) : null}
                  {canManage && action.responsible_leader ? (
                    <p className="text-sm text-muted-foreground">Responsible: {action.responsible_leader}</p>
                  ) : null}
                  {canManage && action.interview_status && action.interview_status !== 'not_required' ? (
                    <p className="text-sm text-muted-foreground">
                      Interview: {action.interview_status.replaceAll('_', ' ')}
                      {action.interviewer_name ? ` — ${action.interviewer_name}` : ''}
                    </p>
                  ) : null}
                  {canManage && action.lcr_follow_up_status === 'needed' ? (
                    <p className="text-sm font-medium text-amber-700">LCR update needed</p>
                  ) : null}
                  {templates[action.action_type] ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm">{fillTemplate(templates[action.action_type]!, action)}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border px-2 py-1 text-xs">
                    {action.status === 'action_needed' ? 'Action needed' : action.status[0].toUpperCase() + action.status.slice(1)}
                  </span>
                  {canManage && action.interview_status && ['needed', 'scheduled'].includes(action.interview_status) ? (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void updateAction(action.id, 'interview_completed')}>
                      Interview complete
                    </Button>
                  ) : null}
                  {canManage && action.status === 'completed' && action.lcr_follow_up_status === 'needed' ? (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void updateAction(action.id, 'lcr_completed')}>
                      Mark LCR updated
                    </Button>
                  ) : null}
                  {canManage && action.status === 'pending' ? (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void updateAction(action.id, 'announced')}>
                      Mark announced
                    </Button>
                  ) : null}
                  {canManage && action.status === 'action_needed' ? (
                    <Button size="sm" disabled={busy} onClick={() => void updateAction(action.id, 'completed')}>
                      Mark completed
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No membership or ordinance actions added.</p>
      )}
    </section>
  );
}
