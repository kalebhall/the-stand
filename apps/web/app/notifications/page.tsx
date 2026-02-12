import { redirect } from 'next/navigation';

import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canViewCallings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { fetchNotificationDiagnostics } from '@/src/notifications/diagnostics';

export default async function NotificationsPage() {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);

  if (!session.activeWardId || !canViewCallings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) {
    redirect('/dashboard');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId: session.activeWardId });
    const deliveries = await fetchNotificationDiagnostics(client, session.activeWardId, 25);
    await client.query('COMMIT');

    const failedDeliveries = deliveries.filter((delivery) => delivery.deliveryStatus === 'failure');

    return (
      <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
        <section className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Notification Diagnostics</h1>
          <p className="text-sm text-muted-foreground">Recent webhook deliveries and failures for this ward.</p>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">Recent deliveries</p>
            <p className="mt-2 text-2xl font-semibold">{deliveries.length}</p>
          </article>
          <article className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">Failures</p>
            <p className="mt-2 text-2xl font-semibold">{failedDeliveries.length}</p>
          </article>
          <article className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">Last attempt</p>
            <p className="mt-2 text-sm font-medium">{deliveries[0]?.attemptedAt ?? 'No deliveries yet'}</p>
          </article>
        </section>

        <section className="overflow-x-auto rounded-lg border bg-card">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="px-3 py-2">Event</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Attempts</th>
                <th className="px-3 py-2">Attempted At</th>
                <th className="px-3 py-2">Error</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.length ? (
                deliveries.map((delivery) => (
                  <tr key={delivery.deliveryId} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium">{delivery.eventType}</td>
                    <td className="px-3 py-2">{delivery.deliveryStatus}</td>
                    <td className="px-3 py-2">{delivery.attempts}</td>
                    <td className="px-3 py-2">{delivery.attemptedAt ?? '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{delivery.errorMessage ?? '—'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-3 py-4 text-muted-foreground" colSpan={5}>
                    No notification deliveries yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </main>
    );
  } catch {
    await client.query('ROLLBACK');
    throw new Error('Failed to load notification diagnostics');
  } finally {
    client.release();
  }
}
