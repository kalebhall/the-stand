import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canRunImports } from '@/src/auth/roles';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { isWardModuleEnabled } from '@/src/modules/service';

export default async function ImportsHubPage() {
  const t = await getTranslations('imports');
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);

  if (!session.activeWardId || !(await isWardModuleEnabled(session.activeWardId, session.user.id, 'imports')) || !canRunImports({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) {
    redirect('/dashboard');
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('hub.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('hub.description')}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="section-panel section-panel--resource flex flex-col justify-between rounded-lg border bg-card p-6 shadow-sm space-y-4">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span>👤</span> {t('hub.membersTitle')}
            </h2>
            <p className="text-sm text-muted-foreground">{t('hub.membersDescription')}</p>
          </div>
          <div className="pt-2 flex flex-wrap gap-2">
            <Link href="/imports/members" className={cn(buttonVariants({ size: 'sm' }))}>
              {t('hub.memberImporter')}
            </Link>
            <Link href="/members" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
              {t('hub.viewMembers')}
            </Link>
          </div>
        </section>

        <section className="section-panel section-panel--service flex flex-col justify-between rounded-lg border bg-card p-6 shadow-sm space-y-4">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span>📋</span> {t('hub.callingsTitle')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t('hub.callingsDescription')}
            </p>
          </div>
          <div className="pt-2 flex flex-wrap gap-2">
            <Link href="/imports/callings" className={cn(buttonVariants({ size: 'sm' }))}>
              {t('hub.callingsImporter')}
            </Link>
            <Link href="/callings" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
              {t('hub.viewCallings')}
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
