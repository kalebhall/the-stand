import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canViewCallings, canViewMeetings, hasRole } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

function DashboardCard({
  title,
  value,
  detail,
  actions
}: {
  title: string;
  value: string;
  detail: string;
  actions?: { href: string; label: string }[];
}) {
  return (
    <article className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
      {actions?.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {actions.map((action) => (
            <Link key={action.href} href={action.href} className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}>
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export default async function DashboardPage() {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);

  const wardSession = session.activeWardId
    ? { roles: session.user.roles, activeWardId: session.activeWardId }
    : null;
  const canAccessMeetings = wardSession
    ? canViewMeetings(wardSession, session.activeWardId!)
    : false;
  const canAccessCallings = wardSession
    ? canViewCallings(wardSession, session.activeWardId!)
    : false;
  const canAccessPortal = Boolean(session.activeWardId) && hasRole(session.user.roles, 'STAND_ADMIN');
  const showSupportCards = session.user.roles?.includes('SUPPORT_ADMIN') ?? false;
  let setApartQueueCount = 'Unavailable';
  let notificationHealthValue = 'No deliveries yet';
  let notificationHealthDetail = 'No notification attempts recorded for this ward yet.';
  let nextMeetingValue = 'No meetings scheduled';
  let nextMeetingDetail = 'Create a meeting to unlock edit, stand, and print quick links.';
  let nextMeetingActions: { href: string; label: string }[] = [{ href: '/meetings', label: 'Create first meeting' }];
  let draftCountValue = '0 drafts';
  let draftCountDetail = 'No draft meetings yet.';
  let importSummaryValue = 'No imports yet';
  let importSummaryDetail = 'Use the imports page to import membership or calling data.';
  let portalStatusValue = 'Not configured';
  let portalStatusDetail = 'No public portal token has been created yet.';

  if (session.activeWardId && canAccessCallings) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await setDbContext(client, { userId: session.user.id, wardId: session.activeWardId });

      const result = await client.query(
        `SELECT COUNT(*)::int AS count
           FROM calling_assignment ca
           JOIN LATERAL (
              SELECT action_status
                FROM calling_action
               WHERE calling_assignment_id = ca.id
                 AND ward_id = ca.ward_id
               ORDER BY created_at DESC
               LIMIT 1
           ) latest ON TRUE
          WHERE ca.ward_id = $1
            AND ca.is_active = TRUE
            AND latest.action_status = 'SUSTAINED'`,
        [session.activeWardId]
      );

      const notificationHealthResult = await client.query(
        `SELECT MAX(nd.attempted_at) AS last_delivery_at,
                COUNT(*) FILTER (WHERE nd.delivery_status = 'failure')::int AS failure_count
           FROM notification_delivery nd
          WHERE nd.ward_id = $1`,
        [session.activeWardId]
      );

      const nextMeetingResult = await client.query(
        `SELECT id, meeting_date, meeting_type, status
           FROM meeting
          WHERE ward_id = $1
            AND meeting_date >= CURRENT_DATE
            AND status != 'COMPLETED'
          ORDER BY meeting_date ASC
          LIMIT 1`,
        [session.activeWardId]
      );

      const draftCountResult = await client.query(
        `SELECT COUNT(*)::int AS count
           FROM meeting
          WHERE ward_id = $1
            AND status = 'DRAFT'`,
        [session.activeWardId]
      );

      const importSummaryResult = await client.query(
        `SELECT import_type, parsed_count, committed, created_at
           FROM import_run
          WHERE ward_id = $1
          ORDER BY created_at DESC
          LIMIT 1`,
        [session.activeWardId]
      );

      const portalResult = await client.query(
        `SELECT id FROM public_program_portal WHERE ward_id = $1 LIMIT 1`,
        [session.activeWardId]
      );

      await client.query('COMMIT');
      setApartQueueCount = `${result.rows[0].count} waiting`;
      const notificationHealth = notificationHealthResult.rows[0] as { last_delivery_at: string | null; failure_count: number };
      notificationHealthValue = notificationHealth.last_delivery_at ?? 'No deliveries yet';
      notificationHealthDetail = `${notificationHealth.failure_count} failed deliveries`;

      if (nextMeetingResult.rowCount) {
        const nextMeeting = nextMeetingResult.rows[0] as { id: string; meeting_date: string; meeting_type: string; status: string };
        nextMeetingValue = `${nextMeeting.meeting_date} (${nextMeeting.meeting_type.replaceAll('_', ' ')})`;
        nextMeetingDetail = `Status: ${nextMeeting.status}`;
        nextMeetingActions = [
          { href: `/meetings/${nextMeeting.id}/edit`, label: 'Edit' },
          { href: `/stand/${nextMeeting.id}`, label: 'Stand' },
          { href: `/meetings/${nextMeeting.id}/print`, label: 'Print' }
        ];
      }

      const draftCount = (draftCountResult.rows[0] as { count: number }).count;
      draftCountValue = `${draftCount} draft${draftCount === 1 ? '' : 's'}`;
      draftCountDetail = draftCount > 0 ? `${draftCount} meeting${draftCount === 1 ? '' : 's'} in draft status.` : 'No draft meetings yet.';

      if (importSummaryResult.rowCount) {
        const importRun = importSummaryResult.rows[0] as { import_type: string; parsed_count: number; committed: boolean; created_at: string };
        importSummaryValue = `${importRun.import_type}: ${importRun.parsed_count} records`;
        importSummaryDetail = `${importRun.committed ? 'Committed' : 'Preview only'} on ${new Date(importRun.created_at).toLocaleDateString()}`;
      }

      if (portalResult.rowCount) {
        portalStatusValue = 'Active';
        portalStatusDetail = 'Public portal token is configured. Visitors can view your latest published program.';
      }
    } catch {
      await client.query('ROLLBACK');
      setApartQueueCount = 'Unavailable';
      notificationHealthValue = 'Unavailable';
      notificationHealthDetail = 'Notification diagnostics could not be loaded.';
    } finally {
      client.release();
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {session.user.name ?? session.user.email}.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {canAccessMeetings ? (
          <DashboardCard
            title="Next meeting"
            value={nextMeetingValue}
            detail={nextMeetingDetail}
            actions={nextMeetingActions}
          />
        ) : null}

        {canAccessMeetings ? (
          <DashboardCard
            title="Draft count"
            value={draftCountValue}
            detail={draftCountDetail}
            actions={[{ href: '/meetings', label: 'View meetings' }]}
          />
        ) : null}

        {canAccessCallings ? (
          <DashboardCard
            title="Set apart queue count"
            value={setApartQueueCount}
            detail="Sustained callings awaiting set apart action."
            actions={[{ href: '/callings', label: 'Open callings queue' }]}
          />
        ) : null}

        {canAccessCallings ? (
          <DashboardCard
            title="Notification health"
            value={notificationHealthValue}
            detail={notificationHealthDetail}
            actions={[{ href: '/notifications', label: 'Open diagnostics' }]}
          />
        ) : null}

        {canAccessCallings ? (
          <DashboardCard
            title="Last import summary"
            value={importSummaryValue}
            detail={importSummaryDetail}
            actions={[{ href: '/imports', label: 'Open imports' }]}
          />
        ) : null}

        {canAccessPortal ? (
          <DashboardCard
            title="Public portal status"
            value={portalStatusValue}
            detail={portalStatusDetail}
            actions={[{ href: '/settings/public-portal', label: 'Manage portal' }]}
          />
        ) : null}

        {showSupportCards ? (
          <>
            <DashboardCard
              title="Support: User administration"
              value="Global user controls"
              detail="Manage all user accounts, review role coverage, and activate or deactivate access across the system."
              actions={[{ href: '/support/users', label: 'Open user administration' }]}
            />

            <DashboardCard
              title="Support: Stake & ward provisioning"
              value="Provisioning controls"
              detail="Create new stakes and wards so ward administrators can be assigned and onboarded."
              actions={[{ href: '/support/provisioning', label: 'Open provisioning' }]}
            />
          </>
        ) : null}
      </section>
    </main>
  );
}
