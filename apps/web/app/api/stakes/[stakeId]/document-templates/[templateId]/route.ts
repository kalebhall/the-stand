import { auth } from '@/src/auth/auth';
import { detail, patchDetail, type Session } from '@/src/document-designer/admin-template-routes';

export async function GET(_: Request, context: { params: Promise<{ stakeId: string; templateId: string }> }) {
  const session = await auth();
  const { stakeId, templateId } = await context.params;
  return detail(session as Session, 'STAKE', stakeId, templateId);
}

export async function PATCH(request: Request, context: { params: Promise<{ stakeId: string; templateId: string }> }) {
  const session = await auth();
  const { stakeId, templateId } = await context.params;
  return patchDetail(request, session as Session, 'STAKE', stakeId, templateId);
}
