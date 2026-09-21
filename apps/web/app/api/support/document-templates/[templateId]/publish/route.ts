import { auth } from '@/src/auth/auth';
import { publish, type Session } from '@/src/document-designer/admin-template-routes';

export async function POST(request: Request, context: { params: Promise<{ templateId: string }> }) {
  const session = await auth();
  const { templateId } = await context.params;
  return publish(session as Session, 'SYSTEM', null, templateId, request);
}
