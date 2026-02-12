import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canViewDashboardPublicPortalStatus } from '@/src/auth/navigation';
import { canViewCallings } from '@/src/auth/roles';
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

  const showPortalCard = canViewDashboardPublicPortalStatus(session.user.roles);
  let setApartQueueCount = 'Unavailable';
  let notificationHealthValue = 'No deliveries yet';
  let notificationHealthDetail = 'No notification attempts recorded for this ward yet.';

  if (session.activeWardId && canViewCallings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) {
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

      await client.query('COMMIT');
      setApartQueueCount = `${result.rows[0].count} waiting`;
      const notificationHealth = notificationHealthResult.rows[0] as { last_delivery_at: string | null; failure_count: number };
      notificationHealthValue = notificationHealth.last_delivery_at ?? 'No deliveries yet';
      notificationHealthDetail = `${notificationHealth.failure_count} failed deliveries`;
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
        <p className="text-muted-foreground">Welcome back, {session.user.displayName ?? session.user.email}.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <DashboardCard
          title="Next meeting"
          value="No meetings scheduled"
          detail="Create your first meeting in the next phase to unlock edit, stand, and print quick links."
          actions={[{ href: '/meetings', label: 'Create first meeting' }]}
        />

        <DashboardCard title="Draft count" value="0 drafts" detail="No draft meetings yet." />

        <DashboardCard
          title="Set apart queue count"
          value={setApartQueueCount}
          detail="Sustained callings awaiting set apart action."
          actions={[{ href: '/callings', label: 'Open callings queue' }]}
        />

        <DashboardCard
          title="Notification health"
          value={notificationHealthValue}
          detail={notificationHealthDetail}
          actions={[{ href: '/notifications', label: 'Open diagnostics' }]}
        />

        <DashboardCard
          title="Last import summary"
          value="Pending phase 10"
          detail="Import summaries will populate once membership and calling imports are available."
        />

        {showPortalCard ? (
          <DashboardCard
            title="Public portal status"
            value="Pending phase 8"
            detail="Public portal indicators and token management are planned for the public program milestone."
          />
        ) : null}
      </section>
    </main>
  );
}
