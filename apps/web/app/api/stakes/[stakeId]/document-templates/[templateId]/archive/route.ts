import { auth } from '@/src/auth/auth';
import { archive, type Session } from '@/src/document-designer/admin-template-routes';

export async function POST(_: Request, context: { params: Promise<{ stakeId: string; templateId: string }> }) {
  const session = await auth();
  const { stakeId, templateId } = await context.params;
  return archive(session as Session, 'STAKE', stakeId, templateId);
}
