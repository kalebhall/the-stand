import { redirect } from 'next/navigation';

import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canViewProgramDesigner } from '@/src/auth/roles';
import { ProgramDesignerClient } from './program-designer-client';

export default async function ProgramDesignerPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);
  const { meetingId } = await params;
  if (!session.activeWardId || !canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) redirect('/programs');
  return <ProgramDesignerClient wardId={session.activeWardId} meetingId={meetingId} />;
}
