import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canViewCallings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { isWardModuleEnabled } from '@/src/modules/service';
import { fetchNotificationDiagnostics, type NotificationDiagnosticRow } from '@/src/notifications/diagnostics';

function formatDate(value: string | null, notAttempted: string, locale: string): string {
  if (!value) return notAttempted;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function statusLabel(status: string, success: string, failure: string): string {
  return status === 'success' ? success : status === 'failure' ? failure : status[0]?.toUpperCase() + status.slice(1);
}

export default async function NotificationDiagnosticsPage() {
  const locale = await getLocale();
  const t = await getTranslations('notifications');
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);

  if (!session.activeWardId || !(await isWardModuleEnabled(session.activeWardId, session.user.id, 'notifications')) || !canViewCallings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) {
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
          <h1 id="diagnostics-heading" className="text-2xl font-semibold tracking-tight">{t('diagnosticsTitle')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('diagnosticsDescription')}</p>
        </div>
        <Link href="/notifications" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>{t('backToNotifications')}</Link>
      </header>

      {loadError ? (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">{t('diagnosticsLoadError')}</p>
      ) : deliveries.length === 0 ? (
        <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">{t('noDeliveryRecords')}</p>
      ) : (
        <section className="space-y-3" aria-label={t('recentDeliveries')}>
          {deliveries.map((delivery) => (
            <article key={delivery.deliveryId} className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{delivery.eventType.replaceAll('_', ' ')}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{delivery.channel} · {delivery.aggregateType} · {delivery.aggregateId}</p>
                </div>
                <span className={`rounded-full border px-2 py-1 text-xs font-medium ${delivery.deliveryStatus === 'failure' ? 'border-destructive/40 text-destructive' : ''}`}>
                  {statusLabel(delivery.deliveryStatus, t('success'), t('failure'))}
                </span>
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                <div><dt className="text-muted-foreground">{t('attempted')}</dt><dd>{formatDate(delivery.attemptedAt, t('notAttempted'), locale)}</dd></div>
                <div><dt className="text-muted-foreground">{t('created')}</dt><dd>{formatDate(delivery.createdAt, t('notAttempted'), locale)}</dd></div>
                <div><dt className="text-muted-foreground">{t('outboxAttempts')}</dt><dd>{delivery.attempts}</dd></div>
              </dl>
              {delivery.errorMessage ? <p className="mt-3 rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{delivery.errorMessage}</p> : null}
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
