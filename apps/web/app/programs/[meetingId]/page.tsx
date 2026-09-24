import { redirect } from 'next/navigation';

import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canViewProgramDesigner } from '@/src/auth/roles';
import { isAdvancedDesignerFeatureEnabled } from '@/src/features/advanced-designer';
import { isWardModuleEnabled } from '@/src/modules/service';
import { ProgramDesignerClient } from './program-designer-client';

export default async function ProgramDesignerPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);
  const { meetingId } = await params;
  if (!isAdvancedDesignerFeatureEnabled() || !session.activeWardId || !(await isWardModuleEnabled(session.activeWardId, session.user.id, 'programs')) || !canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) redirect('/meetings');
  return <ProgramDesignerClient wardId={session.activeWardId} meetingId={meetingId} />;
}
