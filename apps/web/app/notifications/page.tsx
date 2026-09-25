import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canViewCallings } from '@/src/auth/roles';
import { NotificationCenter } from './notification-center';
import { isWardModuleEnabled } from '@/src/modules/service';

export default async function NotificationsPage() {
  const t = await getTranslations('notifications');
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);
  if (!session.activeWardId || !(await isWardModuleEnabled(session.activeWardId, session.user.id, 'notifications')) || !canViewCallings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId))
    redirect('/dashboard');

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('pageTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('pageDescription')}</p>
        <div className="flex flex-wrap gap-2">
          <Link href="/notifications/diagnostics" className={buttonVariants({ variant: 'outline', size: 'sm' })}>{t('deliveryDiagnostics')}</Link>
        </div>
      </section>
      <NotificationCenter wardId={session.activeWardId} />
    </main>
  );
}
