import { redirect } from 'next/navigation';

import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canManageWardProgramTemplates, canViewProgramDesigner } from '@/src/auth/roles';
import { TemplateDetailClient } from './template-detail-client';

export default async function TemplateDetailPage({ params }: { params: Promise<{ templateId: string }> }) {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);
  if (!session.activeWardId || !canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) redirect('/dashboard');
  const { templateId } = await params;
  const canCopy = canManageWardProgramTemplates({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId);
  return <TemplateDetailClient wardId={session.activeWardId} templateId={templateId} canCopy={canCopy} />;
}
