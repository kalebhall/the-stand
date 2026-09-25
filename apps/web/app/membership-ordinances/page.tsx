import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canManageMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import {
  getMembershipOrdinanceGroup,
  matchesMembershipOrdinanceFilters,
  MEMBERSHIP_ORDINANCE_ACTION_LABELS,
  MEMBERSHIP_ORDINANCE_STATUS_LABELS,
  type MembershipOrdinanceActionRow,
  type MembershipOrdinanceActionGroup
} from '@/src/church-actions/membership-ordinance';

import { MembershipOrdinanceWorkspaceControls } from './workspace-controls';
import { MembershipOrdinanceSection } from '@/components/MembershipOrdinanceSection';
import { isWardModuleEnabled } from '@/src/modules/service';

const GROUPS: Array<{ key: MembershipOrdinanceActionGroup; titleKey: string; descriptionKey: string }> = [
  { key: 'needs_attention', titleKey: 'needsAttention', descriptionKey: 'needsAttentionDescription' },
  { key: 'upcoming', titleKey: 'upcoming', descriptionKey: 'upcomingDescription' },
  { key: 'completed', titleKey: 'completedHistory', descriptionKey: 'completedHistoryDescription' }
];

type Translator = (key: string, values?: Record<string, string | number>) => string;

type ActionQueryRow = {
  id: string;
  meeting_id: string;
  meeting_date: string;
  meeting_type: string;
  member_name: string;
  action_type: MembershipOrdinanceActionRow['actionType'];
  priesthood_office: MembershipOrdinanceActionRow['priesthoodOffice'];
  status: MembershipOrdinanceActionRow['status'];
  planned_date: string | null;
  responsible_leader: string | null;
  approval_confirmed: boolean;
  presenting_leader: string | null;
  performing_priesthood_holder: string | null;
  ordinance_date: string | null;
  baptism_date: string | null;
  confirmation_date: string | null;
  baptism_status: MembershipOrdinanceActionRow['baptismStatus'];
  confirmation_status: MembershipOrdinanceActionRow['confirmationStatus'];
  interview_status: MembershipOrdinanceActionRow['interviewStatus'];
  lcr_follow_up_status: MembershipOrdinanceActionRow['lcrFollowUpStatus'];
  record_form_needed: boolean;
  handoff_date: string | null;
  official_record_updated_by: string | null;
  certificate_or_form_delivered: boolean;
  official_system_follow_up_status: MembershipOrdinanceActionRow['officialSystemFollowUpStatus'];
  official_system_reference_url: string | null;
};

type MeetingOptionRow = { id: string; meeting_date: string; meeting_type: string };

function displayDate(value: string | null, locale: string, noDateSet: string): string {
  if (!value) return noDateSet;
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${value}T12:00:00Z`)
  );
}

function getMembershipOrdinanceNextStepKey(action: MembershipOrdinanceActionRow): string {
  if (action.lcrFollowUpStatus === 'needed') return 'updateLcr';
  if (action.status === 'action_needed') return 'completeAction';
  if (action.interviewStatus === 'needed') return 'scheduleInterview';
  if (action.interviewStatus === 'scheduled') return 'completeInterview';
  if (action.status === 'pending') return 'presentInMeeting';
  return 'complete';
}

function ActionCard({ action, wardId, locale, t }: { action: MembershipOrdinanceActionRow; wardId: string; locale: string; t: Translator }) {
  return (
    <article className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t(`action_${action.actionType}`)}</p>
          <h3 className="mt-1 text-lg font-semibold">{action.memberName}</h3>
          {action.priesthoodOffice ? <p className="mt-1 text-sm text-muted-foreground">{t('office')} {t(`office_${action.priesthoodOffice}`)}</p> : null}
        </div>
        <span className="rounded-full border px-2.5 py-1 text-xs font-medium">
          {t(`status_${action.status}`)}
        </span>
      </div>

      <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
        <p>
          <span className="font-medium text-foreground">{t('meeting')}</span> {displayDate(action.meetingDate, locale, t('noDateSet'))} · {t(`meetingType_${action.meetingType}`)}
        </p>
        <p>
          <span className="font-medium text-foreground">{t('planned')}</span> {displayDate(action.plannedDate, locale, t('noDateSet'))}
        </p>
        <p>
          <span className="font-medium text-foreground">{t('responsible')}</span> {action.responsibleLeader ?? t('unassigned')}
        </p>
        <p>
          <span className="font-medium text-foreground">{t('next')}</span> {t(`next_${getMembershipOrdinanceNextStepKey(action)}`)}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {action.interviewStatus !== 'not_required' ? (
          <span className="rounded bg-muted px-2 py-1">{t('interview')} {t(`interview_${action.interviewStatus}`)}</span>
        ) : null}
        {action.lcrFollowUpStatus === 'needed' ? (
          <span className="rounded bg-amber-500/10 px-2 py-1 font-medium text-amber-700 dark:text-amber-300">{t('lcrUpdateNeededBadge')}</span>
        ) : null}
        {action.recordFormNeeded && action.officialSystemFollowUpStatus !== 'not_applicable' ? (
          <span className="rounded bg-blue-500/10 px-2 py-1 font-medium text-blue-700 dark:text-blue-300">
            {t('officialRecordBadge', { status: t(`officialRecord_${action.officialSystemFollowUpStatus}`) })}
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/meetings/${action.meetingId}/edit`} className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}>
          {t('openMeeting')}
        </Link>
        <MembershipOrdinanceWorkspaceControls action={action} wardId={wardId} />
      </div>
    </article>
  );
}

export default async function MembershipOrdinancesPage({ searchParams }: { searchParams: Promise<{ q?: string; action?: string; status?: string; queue?: string; followup?: string }> }) {
  const t = await getTranslations('membershipOrdinances');
  const locale = await getLocale();
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);

  if (!session.activeWardId || !(await isWardModuleEnabled(session.activeWardId, session.user.id, 'membership-ordinances')) || !canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) {
    redirect('/dashboard');
  }

  const filters = await searchParams;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId: session.activeWardId });
    const result = await client.query(
      `SELECT a.id, a.meeting_id, m.meeting_date, m.meeting_type, a.member_name, a.action_type, a.priesthood_office, a.status,
              a.planned_date, a.responsible_leader, a.interview_status, a.approval_confirmed, a.presenting_leader,
              a.performing_priesthood_holder, a.ordinance_date, a.baptism_date, a.confirmation_date, a.baptism_status, a.confirmation_status, a.lcr_follow_up_status,
              a.record_form_needed, a.handoff_date, a.official_record_updated_by,
              a.certificate_or_form_delivered, a.official_system_follow_up_status,
              a.official_system_reference_url
         FROM meeting_membership_ordinance a
         JOIN meeting m ON m.id = a.meeting_id AND m.ward_id = a.ward_id
        WHERE a.ward_id = $1::uuid
        ORDER BY COALESCE(a.planned_date, m.meeting_date) ASC, a.created_at ASC`,
      [session.activeWardId]
    );
    const meetingsResult = await client.query(
      'SELECT id, meeting_date, meeting_type FROM meeting WHERE ward_id = $1::uuid ORDER BY meeting_date DESC',
      [session.activeWardId]
    );
    await client.query('COMMIT');

    const today = new Date().toISOString().slice(0, 10);
    const allActions = (result.rows as ActionQueryRow[]).map((row) => ({
      id: row.id,
      meetingId: row.meeting_id,
      meetingDate: row.meeting_date,
      meetingType: row.meeting_type,
      memberName: row.member_name,
      actionType: row.action_type,
      priesthoodOffice: row.priesthood_office,
      status: row.status,
      plannedDate: row.planned_date,
      responsibleLeader: row.responsible_leader,
      interviewStatus: row.interview_status,
      approvalConfirmed: row.approval_confirmed,
      presentingLeader: row.presenting_leader,
      performingPriesthoodHolder: row.performing_priesthood_holder,
      ordinanceDate: row.ordinance_date,
      baptismDate: row.baptism_date,
      confirmationDate: row.confirmation_date,
      baptismStatus: row.baptism_status,
      confirmationStatus: row.confirmation_status,
      lcrFollowUpStatus: row.lcr_follow_up_status,
      recordFormNeeded: row.record_form_needed,
      handoffDate: row.handoff_date,
      officialRecordUpdatedBy: row.official_record_updated_by,
      certificateOrFormDelivered: row.certificate_or_form_delivered,
      officialSystemFollowUpStatus: row.official_system_follow_up_status,
      officialSystemReferenceUrl: row.official_system_reference_url
    }));
    const meetingOptions = (meetingsResult.rows as MeetingOptionRow[]).map((meeting) => ({
      id: meeting.id,
      label: `${displayDate(meeting.meeting_date, locale, t('noDateSet'))} · ${t(`meetingType_${meeting.meeting_type}`)}`
    }));
    const actions = allActions.filter((action) => matchesMembershipOrdinanceFilters(action, {
      query: filters.q,
      actionType: filters.action,
      status: filters.status,
      group: filters.queue,
      followup: filters.followup
    }, today));
    const grouped = new Map<MembershipOrdinanceActionGroup, MembershipOrdinanceActionRow[]>([
      ['needs_attention', []],
      ['upcoming', []],
      ['completed', []]
    ]);
    for (const action of actions) grouped.get(getMembershipOrdinanceGroup(action, today))?.push(action);

    return (
      <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
        <section className="space-y-2 rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('description')}
              </p>
            </div>
            <Link href="/meetings" className={cn(buttonVariants({ variant: 'outline' }))}>
              {t('openMeetings')}
            </Link>
          </div>
          <form method="get" className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <input name="q" defaultValue={filters.q ?? ''} placeholder={t('searchPlaceholder')} className="rounded-md border bg-background px-3 py-2 text-sm lg:col-span-2" />
            <select name="action" defaultValue={filters.action ?? 'all'} className="rounded-md border bg-background px-3 py-2 text-sm">
              <option value="all">{t('allActions')}</option>
              {Object.keys(MEMBERSHIP_ORDINANCE_ACTION_LABELS).map((value) => <option key={value} value={value}>{t(`action_${value}`)}</option>)}
            </select>
            <select name="status" defaultValue={filters.status ?? 'all'} className="rounded-md border bg-background px-3 py-2 text-sm">
              <option value="all">{t('allStatuses')}</option>
              {Object.keys(MEMBERSHIP_ORDINANCE_STATUS_LABELS).map((value) => <option key={value} value={value}>{t(`status_${value}`)}</option>)}
            </select>
            <select name="queue" defaultValue={filters.queue ?? 'all'} className="rounded-md border bg-background px-3 py-2 text-sm">
              <option value="all">{t('allQueues')}</option>
              {GROUPS.map((group) => <option key={group.key} value={group.key}>{t(group.titleKey)}</option>)}
            </select>
            <select name="followup" defaultValue={filters.followup ?? 'all'} className="rounded-md border bg-background px-3 py-2 text-sm">
              <option value="all">{t('allFollowUp')}</option>
              <option value="interview">{t('interviewNeeded')}</option>
              <option value="lcr">{t('lcrUpdateNeeded')}</option>
              <option value="official-record">{t('officialRecordHandoffNeeded')}</option>
              <option value="overdue">{t('overdue')}</option>
            </select>
            <button type="submit" className={cn(buttonVariants({ size: 'sm' }))}>{t('applyFilters')}</button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">{t('showing', { shown: actions.length, total: allActions.length })}</p>
        </section>

        <MembershipOrdinanceSection
          wardId={session.activeWardId}
          meetingId=""
          meetingOptions={meetingOptions}
          actions={[]}
          canManage
          createOnly
        />

        {GROUPS.map((group) => {
          const groupActions = grouped.get(group.key) ?? [];
          return (
            <section key={group.key} className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold">{t(group.titleKey)} <span className="text-muted-foreground">({groupActions.length})</span></h2>
                <p className="text-sm text-muted-foreground">{t(group.descriptionKey)}</p>
              </div>
              {groupActions.length ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  {groupActions.map((action) => <ActionCard key={action.id} action={action} wardId={session.activeWardId!} locale={locale} t={t} />)}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t('noActionsInGroup')}</p>
              )}
            </section>
          );
        })}
      </main>
    );
  } catch {
    await client.query('ROLLBACK');
    throw new Error('Failed to load membership and ordinance workspace');
  } finally {
    client.release();
  }
}
