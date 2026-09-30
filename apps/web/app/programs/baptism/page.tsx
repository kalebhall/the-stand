import { redirect } from 'next/navigation';

import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canEditProgramDesign, canViewProgramDesigner } from '@/src/auth/roles';
import { isWardModuleEnabled } from '@/src/modules/service';
import { BaptismProgramsClient } from './baptism-programs-client';

export default async function BaptismProgramsPage() {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);
  if (!session.activeWardId || !(await isWardModuleEnabled(session.activeWardId, session.user.id, 'programs')) || !canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) redirect('/dashboard');
  return <BaptismProgramsClient wardId={session.activeWardId} canEdit={canEditProgramDesign({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)} />;
}
