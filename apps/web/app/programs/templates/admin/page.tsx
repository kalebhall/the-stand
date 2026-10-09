import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canManageStakeTemplates, canManageSystemTemplates } from '@/src/auth/roles';
import { isAdvancedDesignerFeatureEnabled } from '@/src/features/advanced-designer';
import { isWardModuleEnabled } from '@/src/modules/service';
import { TemplateAdminClient } from './template-admin-client';

export default async function TemplateAdministrationPage({ searchParams }: { searchParams?: Promise<{ scope?: string; stakeId?: string }> }) {
  const t = await getTranslations('programs');
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);
  if (!isAdvancedDesignerFeatureEnabled() || (session.activeWardId && !(await isWardModuleEnabled(session.activeWardId, session.user.id, 'programs')))) redirect('/dashboard');
  const query = await searchParams;
  const requestedStakeId = query?.stakeId || session.activeStakeId;
  const canSystem = canManageSystemTemplates({ roles: session.user.roles });
  const canStake = Boolean(requestedStakeId && canManageStakeTemplates({
    roles: session.user.roles,
    activeStakeId: session.activeStakeId,
    stakeAssignments: session.stakeAssignments
  }, requestedStakeId));

  if (!canSystem && !canStake) redirect('/dashboard');
  const initialScope = query?.scope === 'STAKE' && canStake ? 'STAKE' : query?.scope === 'SYSTEM' && canSystem ? 'SYSTEM' : undefined;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <header>
        <p className="text-sm font-medium text-muted-foreground">{t('designer')}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{t('administration')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('administrationDescription')}</p>
      </header>
      <TemplateAdminClient
        activeStakeId={requestedStakeId ?? null}
        canSystem={canSystem}
        canStake={canStake}
        initialScope={initialScope}
      />
    </main>
  );
}
