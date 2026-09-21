import { auth } from '@/src/auth/auth';
import { createTemplate, listTemplates, type Session } from '@/src/document-designer/admin-template-routes';

export async function GET(_: Request, context: { params: Promise<{ stakeId: string }> }) {
  const session = await auth();
  const { stakeId } = await context.params;
  return listTemplates(session as Session, 'STAKE', stakeId);
}

export async function POST(request: Request, context: { params: Promise<{ stakeId: string }> }) {
  const session = await auth();
  const { stakeId } = await context.params;
  return createTemplate(request, session as Session, 'STAKE', stakeId);
}
