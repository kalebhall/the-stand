import { redirect } from 'next/navigation';

import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canManageStakeTemplates, canManageSystemTemplates, canManageWardProgramTemplates, canViewProgramDesigner } from '@/src/auth/roles';
import { isAdvancedDesignerFeatureEnabled } from '@/src/features/advanced-designer';
import { isWardModuleEnabled } from '@/src/modules/service';
import { pool } from '@/src/db/client';
import { TemplateStudioClient } from './template-studio-client';

export default async function TemplateStudioPage({ params, searchParams }: { params: Promise<{ templateId: string }>; searchParams?: Promise<{ adminScope?: string; stakeId?: string }> }) {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);
  const { templateId } = await params;
  const query = await searchParams;
  const adminScope = query?.adminScope === 'SYSTEM' || query?.adminScope === 'STAKE' ? query.adminScope : null;
  const adminStakeId = query?.stakeId ?? session.activeStakeId;
  if (!isAdvancedDesignerFeatureEnabled() || (session.activeWardId && !(await isWardModuleEnabled(session.activeWardId, session.user.id, 'programs')))) redirect('/dashboard');

  if (adminScope === 'SYSTEM') {
    if (!canManageSystemTemplates({ roles: session.user.roles })) redirect('/dashboard');
    return <TemplateStudioClient templateId={templateId} canEdit apiBase="/api/support/document-templates" backHref="/programs/templates/admin?scope=SYSTEM" />;
  }
  if (adminScope === 'STAKE') {
    if (!adminStakeId || !canManageStakeTemplates({ roles: session.user.roles, activeStakeId: session.activeStakeId, stakeAssignments: session.stakeAssignments }, adminStakeId)) redirect('/dashboard');
    return <TemplateStudioClient templateId={templateId} canEdit apiBase={`/api/stakes/${encodeURIComponent(adminStakeId)}/document-templates`} backHref={`/programs/templates/admin?scope=STAKE&stakeId=${encodeURIComponent(adminStakeId)}`} />;
  }

  if (!session.activeWardId || !(await isWardModuleEnabled(session.activeWardId, session.user.id, 'programs'))) redirect('/dashboard');
  const stakeMatchesWard = session.activeStakeId ? (await pool.query('SELECT 1 FROM ward WHERE id = $1::uuid AND stake_id = $2::uuid LIMIT 1', [session.activeWardId, session.activeStakeId])).rowCount === 1 : false;
  if (!canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId) && !(stakeMatchesWard && session.activeStakeId && canManageStakeTemplates(session, session.activeStakeId))) redirect('/dashboard');
  const canEdit = canManageWardProgramTemplates({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId) || (stakeMatchesWard && session.activeStakeId ? canManageStakeTemplates(session, session.activeStakeId) : false);
  return <TemplateStudioClient templateId={templateId} canEdit={canEdit} apiBase={`/api/w/${encodeURIComponent(session.activeWardId)}/document-templates`} />;
}
