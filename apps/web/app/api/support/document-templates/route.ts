import { auth } from '@/src/auth/auth';
import { createTemplate, listTemplates, type Session } from '@/src/document-designer/admin-template-routes';

export async function GET() {
  const session = await auth();
  return listTemplates(session as Session, 'SYSTEM', null);
}

export async function POST(request: Request) {
  const session = await auth();
  return createTemplate(request, session as Session, 'SYSTEM', null);
}
