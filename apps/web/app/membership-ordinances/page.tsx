import Link from 'next/link';
import { redirect } from 'next/navigation';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canManageMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import {
  getMembershipOrdinanceActionLabel,
  getMembershipOrdinanceGroup,
  getMembershipOrdinanceNextStep,
  MEMBERSHIP_ORDINANCE_STATUS_LABELS,
  type MembershipOrdinanceActionRow,
  type MembershipOrdinanceActionGroup
} from '@/src/church-actions/membership-ordinance';

const GROUPS: Array<{ key: MembershipOrdinanceActionGroup; title: string; description: string }> = [
  { key: 'needs_attention', title: 'Needs attention', description: 'Actions with follow-up, interview, LCR, or overdue work.' },
  { key: 'upcoming', title: 'Upcoming', description: 'Planned actions that do not currently need follow-up.' },
  { key: 'completed', title: 'Completed history', description: 'Finished actions retained for reference.' }
];

type ActionQueryRow = {
  id: string;
  meeting_id: string;
  meeting_date: string;
  meeting_type: string;
  member_name: string;
  action_type: MembershipOrdinanceActionRow['actionType'];
  status: MembershipOrdinanceActionRow['status'];
  planned_date: string | null;
  responsible_leader: string | null;
  interview_status: MembershipOrdinanceActionRow['interviewStatus'];
  lcr_follow_up_status: MembershipOrdinanceActionRow['lcrFollowUpStatus'];
};

function displayDate(value: string | null): string {
  if (!value) return 'No date set';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${value}T12:00:00Z`)
  );
}

function displayMeetingType(value: string): string {
  return value
    .split('_')
    .map((part) => `${part.slice(0, 1)}${part.slice(1).toLowerCase()}`)
    .join(' ');
}

function ActionCard({ action }: { action: MembershipOrdinanceActionRow }) {
  return (
    <article className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{getMembershipOrdinanceActionLabel(action.actionType)}</p>
          <h3 className="mt-1 text-lg font-semibold">{action.memberName}</h3>
        </div>
        <span className="rounded-full border px-2.5 py-1 text-xs font-medium">
          {MEMBERSHIP_ORDINANCE_STATUS_LABELS[action.status]}
        </span>
      </div>

      <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
        <p>
          <span className="font-medium text-foreground">Meeting:</span> {displayDate(action.meetingDate)} · {displayMeetingType(action.meetingType)}
        </p>
        <p>
          <span className="font-medium text-foreground">Planned:</span> {displayDate(action.plannedDate)}
        </p>
        <p>
          <span className="font-medium text-foreground">Responsible:</span> {action.responsibleLeader ?? 'Unassigned'}
        </p>
        <p>
          <span className="font-medium text-foreground">Next:</span> {getMembershipOrdinanceNextStep(action)}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {action.interviewStatus !== 'not_required' ? (
          <span className="rounded bg-muted px-2 py-1">Interview: {action.interviewStatus.replaceAll('_', ' ')}</span>
        ) : null}
        {action.lcrFollowUpStatus === 'needed' ? (
          <span className="rounded bg-amber-500/10 px-2 py-1 font-medium text-amber-700 dark:text-amber-300">LCR update needed</span>
        ) : null}
      </div>

      <div className="mt-4">
        <Link href={`/meetings/${action.meetingId}/edit`} className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}>
          Open meeting
        </Link>
      </div>
    </article>
  );
}

export default async function MembershipOrdinancesPage() {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);

  if (!session.activeWardId || !canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) {
    redirect('/dashboard');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId: session.activeWardId });
    const result = await client.query(
      `SELECT a.id, a.meeting_id, m.meeting_date, m.meeting_type, a.member_name, a.action_type, a.status,
              a.planned_date, a.responsible_leader, a.interview_status, a.lcr_follow_up_status
         FROM meeting_membership_ordinance a
         JOIN meeting m ON m.id = a.meeting_id AND m.ward_id = a.ward_id
        WHERE a.ward_id = $1::uuid
        ORDER BY COALESCE(a.planned_date, m.meeting_date) ASC, a.created_at ASC`,
      [session.activeWardId]
    );
    await client.query('COMMIT');

    const today = new Date().toISOString().slice(0, 10);
    const actions = (result.rows as ActionQueryRow[]).map((row) => ({
      id: row.id,
      meetingId: row.meeting_id,
      meetingDate: row.meeting_date,
      meetingType: row.meeting_type,
      memberName: row.member_name,
      actionType: row.action_type,
      status: row.status,
      plannedDate: row.planned_date,
      responsibleLeader: row.responsible_leader,
      interviewStatus: row.interview_status,
      lcrFollowUpStatus: row.lcr_follow_up_status
    }));
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
              <h1 className="text-2xl font-semibold tracking-tight">Membership &amp; Ordinances</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Track preparation and follow-up separately from calling assignments and meeting business.
              </p>
            </div>
            <Link href="/meetings" className={cn(buttonVariants({ variant: 'outline' }))}>
              Open meetings
            </Link>
          </div>
        </section>

        {GROUPS.map((group) => {
          const groupActions = grouped.get(group.key) ?? [];
          return (
            <section key={group.key} className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold">{group.title} <span className="text-muted-foreground">({groupActions.length})</span></h2>
                <p className="text-sm text-muted-foreground">{group.description}</p>
              </div>
              {groupActions.length ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  {groupActions.map((action) => <ActionCard key={action.id} action={action} />)}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No actions in this group.</p>
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
