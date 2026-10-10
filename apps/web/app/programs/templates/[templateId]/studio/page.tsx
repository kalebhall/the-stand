import { redirect } from 'next/navigation';

import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canManageStakeTemplates, canManageSystemTemplates, canManageWardProgramTemplates, canUseAdvancedProgramDesigner, canUseSharedAdvancedProgramDesigner, canViewProgramDesigner } from '@/src/auth/roles';
import { isAdvancedDesignerFeatureEnabled } from '@/src/features/advanced-designer';
import { isWardModuleEnabled } from '@/src/modules/service';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { loadProgramPermissionProfile } from '@/src/document-designer/template-service';
import { TemplateStudioClient } from './template-studio-client';

async function loadWardProgramPermissionProfile(wardId: string, userId: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { wardId, userId });
    const profile = await loadProgramPermissionProfile(client, wardId);
    await client.query('COMMIT');
    return profile;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export default async function TemplateStudioPage({ params, searchParams }: { params: Promise<{ templateId: string }>; searchParams?: Promise<{ adminScope?: string; stakeId?: string }> }) {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);
  const { templateId } = await params;
  const query = await searchParams;
  const adminScope = query?.adminScope === 'SYSTEM' || query?.adminScope === 'STAKE' ? query.adminScope : null;
  const adminStakeId = query?.stakeId ?? session.activeStakeId;
  const stakeMatchesWard = session.activeWardId && session.activeStakeId
    ? (await pool.query('SELECT 1 FROM ward WHERE id = $1::uuid AND stake_id = $2::uuid LIMIT 1', [session.activeWardId, session.activeStakeId])).rowCount === 1
    : false;
  const stakeAdminAdvancedEditing = Boolean(stakeMatchesWard && session.activeStakeId && canManageStakeTemplates(session, session.activeStakeId));
  const sharedAdvancedEditing = adminScope
    ? canUseSharedAdvancedProgramDesigner(
        { roles: session.user.roles, activeWardId: session.activeWardId, activeStakeId: session.activeStakeId, stakeAssignments: session.stakeAssignments },
        adminScope,
        adminScope === 'STAKE' ? adminStakeId : null
      )
    : null;
  const advancedEditing = sharedAdvancedEditing ?? (stakeAdminAdvancedEditing || (session.activeWardId
    ? canUseAdvancedProgramDesigner(
        { roles: session.user.roles, activeWardId: session.activeWardId },
        session.activeWardId,
        await loadWardProgramPermissionProfile(session.activeWardId, session.user.id)
      )
    : Boolean(session.user.roles?.includes('STAND_ADMIN') || session.user.roles?.includes('BISHOPRIC_EDITOR'))));
  if (!isAdvancedDesignerFeatureEnabled() || (session.activeWardId && !(await isWardModuleEnabled(session.activeWardId, session.user.id, 'programs')))) redirect('/dashboard');

  if (adminScope === 'SYSTEM') {
    if (!canManageSystemTemplates({ roles: session.user.roles })) redirect('/dashboard');
    return <TemplateStudioClient templateId={templateId} canEdit advancedEditing={advancedEditing} apiBase="/api/support/document-templates" backHref="/programs/templates/admin?scope=SYSTEM" />;
  }
  if (adminScope === 'STAKE') {
    if (!adminStakeId || !canManageStakeTemplates({ roles: session.user.roles, activeStakeId: session.activeStakeId, stakeAssignments: session.stakeAssignments }, adminStakeId)) redirect('/dashboard');
    return <TemplateStudioClient templateId={templateId} canEdit advancedEditing={advancedEditing} apiBase={`/api/stakes/${encodeURIComponent(adminStakeId)}/document-templates`} backHref={`/programs/templates/admin?scope=STAKE&stakeId=${encodeURIComponent(adminStakeId)}`} />;
  }

  if (!session.activeWardId || !(await isWardModuleEnabled(session.activeWardId, session.user.id, 'programs'))) redirect('/dashboard');
  if (!canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId) && !(stakeMatchesWard && session.activeStakeId && canManageStakeTemplates(session, session.activeStakeId))) redirect('/dashboard');
  const canEdit = canManageWardProgramTemplates({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId) || (stakeMatchesWard && session.activeStakeId ? canManageStakeTemplates(session, session.activeStakeId) : false);
  return <TemplateStudioClient templateId={templateId} canEdit={canEdit} advancedEditing={advancedEditing} apiBase={`/api/w/${encodeURIComponent(session.activeWardId)}/document-templates`} />;
}
