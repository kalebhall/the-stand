import { redirect } from 'next/navigation';

import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canManageStakeTemplates, canManageWardProgramTemplates, canViewProgramDesigner } from '@/src/auth/roles';
import { isAdvancedDesignerFeatureEnabled } from '@/src/features/advanced-designer';
import { isWardModuleEnabled } from '@/src/modules/service';
import { pool } from '@/src/db/client';
import { TemplateDetailClient } from './template-detail-client';

export default async function TemplateDetailPage({ params }: { params: Promise<{ templateId: string }> }) {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);
  const stakeMatchesWard = session.activeStakeId ? (await pool.query('SELECT 1 FROM ward WHERE id = $1::uuid AND stake_id = $2::uuid LIMIT 1', [session.activeWardId, session.activeStakeId])).rowCount === 1 : false;
  if (!session.activeWardId || !isAdvancedDesignerFeatureEnabled() || !(await isWardModuleEnabled(session.activeWardId, session.user.id, 'programs')) || (!canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId) && !(stakeMatchesWard && session.activeStakeId && canManageStakeTemplates(session, session.activeStakeId)))) redirect('/dashboard');
  const { templateId } = await params;
  const canCopy = canManageWardProgramTemplates({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId) || (stakeMatchesWard && session.activeStakeId ? canManageStakeTemplates(session, session.activeStakeId) : false);
  const canEdit = canManageWardProgramTemplates({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId) || (stakeMatchesWard && session.activeStakeId ? canManageStakeTemplates(session, session.activeStakeId) : false);
  return <TemplateDetailClient wardId={session.activeWardId} templateId={templateId} canCopy={canCopy} canEdit={canEdit} />;
}
