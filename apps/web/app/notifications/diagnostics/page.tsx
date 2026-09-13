import Link from 'next/link';
import { redirect } from 'next/navigation';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canViewCallings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { fetchNotificationDiagnostics, type NotificationDiagnosticRow } from '@/src/notifications/diagnostics';

function formatDate(value: string | null): string {
  if (!value) return 'Not attempted';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function statusLabel(status: string): string {
  return status === 'success' ? 'Success' : status === 'failure' ? 'Failure' : status[0]?.toUpperCase() + status.slice(1);
}

export default async function NotificationDiagnosticsPage() {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);

  if (!session.activeWardId || !canViewCallings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) {
    redirect('/dashboard');
  }

  const client = await pool.connect();
  let deliveries: NotificationDiagnosticRow[] = [];
  let loadError = false;

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId: session.activeWardId });
    deliveries = await fetchNotificationDiagnostics(client, session.activeWardId, 100);
    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK');
    loadError = true;
  } finally {
    client.release();
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6" aria-labelledby="diagnostics-heading">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 id="diagnostics-heading" className="text-2xl font-semibold tracking-tight">Notification diagnostics</h1>
          <p className="mt-1 text-sm text-muted-foreground">Recent in-app, email, and webhook delivery records for active ward.</p>
        </div>
        <Link href="/notifications" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>Back to notifications</Link>
      </header>

      {loadError ? (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">Unable to load notification diagnostics.</p>
      ) : deliveries.length === 0 ? (
        <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">No notification delivery records found.</p>
      ) : (
        <section className="space-y-3" aria-label="Recent notification deliveries">
          {deliveries.map((delivery) => (
            <article key={delivery.deliveryId} className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{delivery.eventType.replaceAll('_', ' ')}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{delivery.channel} · {delivery.aggregateType} · {delivery.aggregateId}</p>
                </div>
                <span className={`rounded-full border px-2 py-1 text-xs font-medium ${delivery.deliveryStatus === 'failure' ? 'border-destructive/40 text-destructive' : ''}`}>
                  {statusLabel(delivery.deliveryStatus)}
                </span>
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                <div><dt className="text-muted-foreground">Attempted</dt><dd>{formatDate(delivery.attemptedAt)}</dd></div>
                <div><dt className="text-muted-foreground">Created</dt><dd>{formatDate(delivery.createdAt)}</dd></div>
                <div><dt className="text-muted-foreground">Outbox attempts</dt><dd>{delivery.attempts}</dd></div>
              </dl>
              {delivery.errorMessage ? <p className="mt-3 rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{delivery.errorMessage}</p> : null}
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
