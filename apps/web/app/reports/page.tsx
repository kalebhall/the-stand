import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canUseInternalNotes } from '@/src/auth/roles';
import { isWardModuleEnabled } from '@/src/modules/service';
import { ReportHub } from '@/components/reports/report-view';

export default async function ReportsPage() {
  const t = await getTranslations('reports');
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);
  if (
    !session.activeWardId ||
    !(await isWardModuleEnabled(session.activeWardId, session.user.id, 'reports')) ||
    !canUseInternalNotes({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)
  ) {
    redirect('/dashboard');
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </section>
      <ReportHub />
    </main>
  );
}
