import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canManageStakeTemplates, canManageWardProgramTemplates, canViewProgramDesigner } from '@/src/auth/roles';
import { isAdvancedDesignerFeatureEnabled } from '@/src/features/advanced-designer';
import { isWardModuleEnabled } from '@/src/modules/service';
import { pool } from '@/src/db/client';
import { TemplateGalleryClient } from './template-gallery-client';

async function matchingStakeAdmin(session: Awaited<ReturnType<typeof requireAuthenticatedSession>>, wardId: string): Promise<boolean> {
  if (!session.activeStakeId || !canManageStakeTemplates(session, session.activeStakeId)) return false;
  const result = await pool.query('SELECT 1 FROM ward WHERE id = $1::uuid AND stake_id = $2::uuid LIMIT 1', [wardId, session.activeStakeId]);
  return result.rowCount === 1;
}

export default async function TemplateGalleryPage() {
  const t = await getTranslations('programs');
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);
  const isStakeAdmin = session.activeWardId ? await matchingStakeAdmin(session, session.activeWardId) : false;
  if (!session.activeWardId || !isAdvancedDesignerFeatureEnabled() || !(await isWardModuleEnabled(session.activeWardId, session.user.id, 'programs')) || (!canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId) && !isStakeAdmin)) redirect('/dashboard');
  const canCopy = canManageWardProgramTemplates({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId) || isStakeAdmin;
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <div><p className="text-sm font-medium text-muted-foreground">{t('designer')}</p><h1 className="text-3xl font-semibold tracking-tight">{t('gallery')}</h1><p className="mt-1 text-sm text-muted-foreground">{t('galleryDescription')}</p></div>
      <TemplateGalleryClient wardId={session.activeWardId} canCopy={canCopy} />
    </main>
  );
}
