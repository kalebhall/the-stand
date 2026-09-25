import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canManageStakeTemplates, canManageSystemTemplates } from '@/src/auth/roles';
import { isWardModuleEnabled } from '@/src/modules/service';
import { TemplateAdminClient } from './template-admin-client';

export default async function TemplateAdministrationPage() {
  const t = await getTranslations('programs');
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);
  if (!session.activeWardId || !(await isWardModuleEnabled(session.activeWardId, session.user.id, 'programs'))) redirect('/dashboard');
  const canSystem = canManageSystemTemplates({ roles: session.user.roles });
  const canStake = Boolean(session.activeStakeId && canManageStakeTemplates({
    roles: session.user.roles,
    activeStakeId: session.activeStakeId,
    stakeAssignments: session.stakeAssignments
  }, session.activeStakeId ?? ''));

  if (!canSystem && !canStake) redirect('/dashboard');

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <header>
        <p className="text-sm font-medium text-muted-foreground">{t('designer')}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{t('administration')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('administrationDescription')}</p>
      </header>
      <TemplateAdminClient
        activeStakeId={session.activeStakeId}
        canSystem={canSystem}
        canStake={canStake}
      />
    </main>
  );
}
