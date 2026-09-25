import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canManageWardProgramTemplates, canViewProgramDesigner } from '@/src/auth/roles';
import { isWardModuleEnabled } from '@/src/modules/service';
import { TemplateGalleryClient } from './template-gallery-client';

export default async function TemplateGalleryPage() {
  const t = await getTranslations('programs');
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);
  if (!session.activeWardId || !(await isWardModuleEnabled(session.activeWardId, session.user.id, 'programs')) || !canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) redirect('/dashboard');
  const canCopy = canManageWardProgramTemplates({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId);
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <div><p className="text-sm font-medium text-muted-foreground">{t('designer')}</p><h1 className="text-3xl font-semibold tracking-tight">{t('gallery')}</h1><p className="mt-1 text-sm text-muted-foreground">{t('galleryDescription')}</p></div>
      <TemplateGalleryClient wardId={session.activeWardId} canCopy={canCopy} />
    </main>
  );
}
