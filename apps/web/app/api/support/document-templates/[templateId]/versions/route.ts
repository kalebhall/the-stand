import { auth } from '@/src/auth/auth';
import { versions, type Session } from '@/src/document-designer/admin-template-routes';

export async function GET(request: Request, context: { params: Promise<{ templateId: string }> }) {
  const session = await auth();
  const { templateId } = await context.params;
  return versions(session as Session, 'SYSTEM', null, templateId, request, 'GET');
}

export async function POST(request: Request, context: { params: Promise<{ templateId: string }> }) {
  const session = await auth();
  const { templateId } = await context.params;
  return versions(session as Session, 'SYSTEM', null, templateId, request, 'POST');
}
