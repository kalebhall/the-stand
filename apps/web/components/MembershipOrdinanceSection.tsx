'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { MemberAutocomplete } from '@/components/ui/member-autocomplete';
import { PRIESTHOOD_OFFICE_LABELS, type PriesthoodOffice } from '@/src/church-actions/membership-ordinance';

export type MembershipOrdinanceAction = {
  id: string;
  member_name: string;
  action_type:
    | 'WELCOME_NEW_MEMBER'
    | 'RECOGNIZE_BAPTIZED_CHILD'
    | 'BAPTISM_CONFIRMATION_FOLLOW_UP'
    | 'ATTENDANCE_LCR_HANDOFF'
    | 'BABY_BLESSING'
    | 'PRIESTHOOD_ORDINATION'
    | 'PRIESTHOOD_ADVANCEMENT';
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
  baptism_date?: string | null;
  confirmation_date?: string | null;
  baptism_status?: 'planned' | 'completed' | 'cancelled' | null;
  confirmation_status?: 'planned' | 'completed' | 'cancelled' | null;
  responsible_leader?: string | null;
  lcr_follow_up_status?: 'not_applicable' | 'needed' | 'completed';
  lcr_updated_at?: string | null;
};

type Props = {
  wardId: string;
  meetingId: string;
  meetingOptions?: Array<{ id: string; label: string }>;
  actions: MembershipOrdinanceAction[];
  canManage: boolean;
  canCreate?: boolean;
  createOnly?: boolean;
  templates?: Partial<Record<MembershipOrdinanceAction['action_type'], string>>;
};

const OPTIONS = [
  'WELCOME_NEW_MEMBER',
  'RECOGNIZE_BAPTIZED_CHILD',
  'BAPTISM_CONFIRMATION_FOLLOW_UP',
  'ATTENDANCE_LCR_HANDOFF',
  'BABY_BLESSING',
  'PRIESTHOOD_ORDINATION',
  'PRIESTHOOD_ADVANCEMENT'
] as const;
const API_ERROR_CODES = new Set(['INVALID_INPUT', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'STAKE_SCOPE_REQUIRED', 'INTERNAL_ERROR']);

function fillTemplate(template: string, action: MembershipOrdinanceAction, assignedOfficeFallback: string) {
  return template
    .replaceAll('{memberName}', action.member_name)
    .replaceAll('{callingName}', action.details?.trim() || assignedOfficeFallback);
}

export function MembershipOrdinanceSection({
  wardId,
  meetingId,
  meetingOptions = [],
  actions,
  canManage,
  canCreate = true,
  createOnly = false,
  templates = {}
}: Props) {
  const t = useTranslations('membership');
  const [selectedMeetingId, setSelectedMeetingId] = useState(meetingId || meetingOptions[0]?.id || '');
  const [actionType, setActionType] = useState<(typeof OPTIONS)[number]>('WELCOME_NEW_MEMBER');
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
  const [baptismDate, setBaptismDate] = useState('');
  const [confirmationDate, setConfirmationDate] = useState('');
  const [baptismStatus, setBaptismStatus] = useState('planned');
  const [confirmationStatus, setConfirmationStatus] = useState('planned');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createAction() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/w/${wardId}/meetings/${selectedMeetingId}/membership-ordinances`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actionType,
        memberName,
        reason,
        details,
        priesthoodOffice: priesthoodOffice || null,
        plannedDate,
        interviewDate,
        interviewerName,
        approvalConfirmed,
        presentingLeader,
        performingPriesthoodHolder,
        ordinanceDate,
        baptismDate,
        confirmationDate,
        baptismStatus,
        confirmationStatus,
        responsibleLeader
      })
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
      setError(payload?.code && API_ERROR_CODES.has(payload.code) ? t(`error_${payload.code}`) : t('createFailed'));
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
      setError(t('updateFailed'));
      setBusy(false);
      return;
    }
    window.location.reload();
  }

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-md bg-muted/40 p-3">
        <div>
          <h2 className="text-lg font-semibold">{t('title')}</h2>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>
        {!createOnly ? (
          <Link href="/membership-ordinances" className="text-sm font-medium underline underline-offset-4">
            {t('openWorkspace')}
          </Link>
        ) : null}
      </div>
      {canManage && canCreate ? (
        <div className="grid gap-3 rounded-md border bg-background p-3 sm:grid-cols-2">
          <p className="sm:col-span-2 text-xs text-muted-foreground">{t('stakeBoundary')}</p>
          {createOnly ? (
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="font-medium">{t('meeting')}</span>
              <select
                className="w-full rounded-md border px-3 py-2"
                value={selectedMeetingId}
                onChange={(event) => setSelectedMeetingId(event.target.value)}
              >
                <option value="">{t('selectMeeting')}</option>
                {meetingOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="space-y-1 text-sm">
            <span className="font-medium">{t('action')}</span>
            <select
              className="w-full rounded-md border px-3 py-2"
              value={actionType}
              onChange={(e) => setActionType(e.target.value as typeof actionType)}
            >
              {OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {t(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">{t('member')}</span>
            <MemberAutocomplete
              wardId={wardId}
              value={memberName}
              onChange={setMemberName}
              className="w-full rounded-md border px-3 py-2"
              placeholder={t('name')}
            />
          </label>
          {actionType === 'ATTENDANCE_LCR_HANDOFF' ? (
            <p className="sm:col-span-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              {t('attendanceBoundary')}{' '}
              <a
                className="font-medium underline"
                href="https://www.churchofjesuschrist.org/tools/help/record-attendance"
                target="_blank"
                rel="noreferrer"
              >
                {t('attendanceGuidance')}
              </a>
            </p>
          ) : null}

          {actionType === 'WELCOME_NEW_MEMBER' ? (
            <label className="space-y-1 text-sm">
              <span className="font-medium">{t('reason')}</span>
              <select className="w-full rounded-md border px-3 py-2" value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">{t('selectReason')}</option>
                <option value="RECENT_CONVERT">{t('recentConvert')}</option>
                <option value="RECORDS_RECEIVED">{t('recordsReceived')}</option>
              </select>
            </label>
          ) : null}
          {actionType === 'RECOGNIZE_BAPTIZED_CHILD' ? (
            <label className="space-y-1 text-sm">
              <span className="font-medium">{t('recognitionDetails')}</span>
              <input
                className="w-full rounded-md border px-3 py-2"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder={t('optionalPlanningNote')}
              />
            </label>
          ) : null}
          {actionType === 'BAPTISM_CONFIRMATION_FOLLOW_UP' ? (
            <>
              <label className="space-y-1 text-sm">
                <span className="font-medium">{t('baptismDate')}</span>
                <input
                  className="w-full rounded-md border px-3 py-2"
                  type="date"
                  value={baptismDate}
                  onChange={(e) => setBaptismDate(e.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">{t('baptismStatus')}</span>
                <select
                  className="w-full rounded-md border px-3 py-2"
                  value={baptismStatus}
                  onChange={(e) => setBaptismStatus(e.target.value)}
                >
                  <option value="planned">{t('planned')}</option>
                  <option value="completed">{t('completed')}</option>
                  <option value="cancelled">{t('cancelled')}</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">{t('confirmationDate')}</span>
                <input
                  className="w-full rounded-md border px-3 py-2"
                  type="date"
                  value={confirmationDate}
                  onChange={(e) => setConfirmationDate(e.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">{t('confirmationStatus')}</span>
                <select
                  className="w-full rounded-md border px-3 py-2"
                  value={confirmationStatus}
                  onChange={(e) => setConfirmationStatus(e.target.value)}
                >
                  <option value="planned">{t('planned')}</option>
                  <option value="completed">{t('completed')}</option>
                  <option value="cancelled">{t('cancelled')}</option>
                </select>
              </label>
            </>
          ) : null}
          {actionType !== 'WELCOME_NEW_MEMBER' &&
          actionType !== 'RECOGNIZE_BAPTIZED_CHILD' &&
          actionType !== 'BAPTISM_CONFIRMATION_FOLLOW_UP' &&
          actionType !== 'ATTENDANCE_LCR_HANDOFF' ? (
            <label className="space-y-1 text-sm">
              <span className="font-medium">{t('officeOrDetails')}</span>
              <input
                className="w-full rounded-md border px-3 py-2"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder={actionType.includes('PRIESTHOOD') ? t('priesthoodOfficePlaceholder') : t('optionalDetails')}
              />
            </label>
          ) : null}
          {actionType.includes('PRIESTHOOD') ? (
            <>
              <label className="space-y-1 text-sm">
                <span className="font-medium">{t('priesthoodOffice')}</span>
                <select
                  className="w-full rounded-md border px-3 py-2"
                  value={priesthoodOffice}
                  onChange={(e) => setPriesthoodOffice(e.target.value as PriesthoodOffice | '')}
                >
                  <option value="">{t('selectOffice')}</option>
                  {Object.keys(PRIESTHOOD_OFFICE_LABELS).map((value) => (
                    <option key={value} value={value}>
                      {t(`office_${value}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 self-end text-sm">
                <input type="checkbox" checked={approvalConfirmed} onChange={(e) => setApprovalConfirmed(e.target.checked)} />
                {t('approvalConfirmed')}
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">{t('presentingLeader')}</span>
                <input
                  className="w-full rounded-md border px-3 py-2"
                  value={presentingLeader}
                  onChange={(e) => setPresentingLeader(e.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">{t('performingHolder')}</span>
                <input
                  className="w-full rounded-md border px-3 py-2"
                  value={performingPriesthoodHolder}
                  onChange={(e) => setPerformingPriesthoodHolder(e.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">{t('ordinanceDate')}</span>
                <input
                  className="w-full rounded-md border px-3 py-2"
                  type="date"
                  value={ordinanceDate}
                  onChange={(e) => setOrdinanceDate(e.target.value)}
                />
              </label>
            </>
          ) : null}
          <label className="space-y-1 text-sm">
            <span className="font-medium">{t('plannedDate')}</span>
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
                <span className="font-medium">{t('interviewDate')}</span>
                <input
                  className="w-full rounded-md border px-3 py-2"
                  type="date"
                  value={interviewDate}
                  onChange={(e) => setInterviewDate(e.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">{t('interviewer')}</span>
                <input
                  className="w-full rounded-md border px-3 py-2"
                  value={interviewerName}
                  onChange={(e) => setInterviewerName(e.target.value)}
                  placeholder={t('name')}
                />
              </label>
            </>
          ) : null}
          <label className="space-y-1 text-sm">
            <span className="font-medium">{t('responsibleLeader')}</span>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={responsibleLeader}
              onChange={(e) => setResponsibleLeader(e.target.value)}
              placeholder={t('name')}
            />
          </label>
          <div className="flex items-end">
            <Button type="button" disabled={busy || !memberName.trim() || !selectedMeetingId} onClick={() => void createAction()}>
              {t('addAction')}
            </Button>
          </div>
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!createOnly && actions.length ? (
        <ul className="space-y-2">
          {actions.map((action) => (
            <li key={action.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{t(action.action_type)}</p>
                  <p className="font-semibold">{action.member_name}</p>
                  {action.reason ? (
                    <p className="text-sm text-muted-foreground">
                      {action.reason === 'RECORDS_RECEIVED' ? t('recordsReceived') : t('recentConvert')}
                    </p>
                  ) : null}
                  {action.details ? <p className="text-sm text-muted-foreground">{action.details}</p> : null}
                  {action.action_type === 'BAPTISM_CONFIRMATION_FOLLOW_UP' ? (
                    <p className="text-sm text-muted-foreground">
                      {t('baptismSummary', {
                        status: t(action.baptism_status ?? 'planned'),
                        date: action.baptism_date ? ` (${action.baptism_date})` : ''
                      })}{' '}
                      ·{' '}
                      {t('confirmationSummary', {
                        status: t(action.confirmation_status ?? 'planned'),
                        date: action.confirmation_date ? ` (${action.confirmation_date})` : ''
                      })}
                    </p>
                  ) : null}
                  {action.action_type.includes('PRIESTHOOD') && action.priesthood_office ? (
                    <p className="text-sm text-muted-foreground">
                      {t('officeSummary', { office: t(`office_${action.priesthood_office}`) })}
                    </p>
                  ) : null}
                  {canManage && action.action_type.includes('PRIESTHOOD') ? (
                    <p className="text-sm text-muted-foreground">
                      {t('approvalSummary', { status: action.approval_confirmed ? t('confirmed') : t('notConfirmed') })}
                    </p>
                  ) : null}
                  {canManage && action.planned_date ? (
                    <p className="text-sm text-muted-foreground">
                      {t('planned')}: {action.planned_date}
                    </p>
                  ) : null}
                  {canManage && action.responsible_leader ? (
                    <p className="text-sm text-muted-foreground">{t('responsibleSummary', { leader: action.responsible_leader })}</p>
                  ) : null}
                  {canManage && action.interview_status && action.interview_status !== 'not_required' ? (
                    <p className="text-sm text-muted-foreground">
                      {t('interviewSummary', {
                        status: t(action.interview_status),
                        interviewer: action.interviewer_name ? ` — ${action.interviewer_name}` : ''
                      })}
                    </p>
                  ) : null}
                  {canManage && action.lcr_follow_up_status === 'needed' ? (
                    <p className="text-sm font-medium text-amber-700">{t('lcrUpdateNeeded')}</p>
                  ) : null}
                  {templates[action.action_type] ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm">
                      {fillTemplate(templates[action.action_type]!, action, t('assignedOffice'))}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border px-2 py-1 text-xs">{t(`status_${action.status}`)}</span>
                  {canManage && action.interview_status && ['needed', 'scheduled'].includes(action.interview_status) ? (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void updateAction(action.id, 'interview_completed')}>
                      {t('markInterviewComplete')}
                    </Button>
                  ) : null}
                  {canManage && action.status === 'completed' && action.lcr_follow_up_status === 'needed' ? (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void updateAction(action.id, 'lcr_completed')}>
                      {t('markLcrUpdated')}
                    </Button>
                  ) : null}
                  {canManage && action.status === 'pending' ? (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void updateAction(action.id, 'announced')}>
                      {t('markAnnounced')}
                    </Button>
                  ) : null}
                  {canManage && action.status === 'action_needed' ? (
                    <Button size="sm" disabled={busy} onClick={() => void updateAction(action.id, 'completed')}>
                      {t('markCompleted')}
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : !createOnly ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : null}
    </section>
  );
}
