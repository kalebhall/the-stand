import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { hasModulePermission } from '@/src/platform/permissions';
import { canViewMeetings } from '@/src/auth/roles';
import { createLogger } from '@/src/lib/logger';
import { getWardModuleSettings, setWardModuleEnabled } from '@/src/modules/service';

const logger = createLogger('module-settings');

async function access(wardId: string, requireAdmin: boolean) {
  const session = await auth();
  if (!session?.user?.id) return { response: NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 }) };
  const canRead = canViewMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId);
  const canWrite = hasModulePermission({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId, 'module-settings.manage');
  if (session.activeWardId !== wardId || (requireAdmin ? !canWrite : !canRead)) {
    return { response: NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 }) };
  }
  return { session };
}

export async function GET(_: Request, context: { params: Promise<{ wardId: string }> }) {
  const { wardId } = await context.params;
  const allowed = await access(wardId, false);
  if (allowed.response) return allowed.response;
  const modules = await getWardModuleSettings(wardId, allowed.session.user.id);
  return NextResponse.json({ modules });
}

export async function PATCH(request: Request, context: { params: Promise<{ wardId: string }> }) {
  const { wardId } = await context.params;
  const allowed = await access(wardId, true);
  if (allowed.response) return allowed.response;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.moduleId !== 'string' || typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'moduleId and enabled are required', code: 'BAD_REQUEST' }, { status: 400 });
  }
  try {
    const modules = await setWardModuleEnabled(wardId, allowed.session.user.id, body.moduleId, body.enabled);
    return NextResponse.json({ modules });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save module setting';
    const status = message.startsWith('Unknown module') || message.includes('cannot be disabled') ? 400 : 500;
    if (status === 500) logger.error('Failed to save module setting', { wardId, moduleId: body.moduleId, error: message });
    return NextResponse.json({ error: status === 400 ? message : 'Failed to save module setting', code: status === 400 ? 'BAD_REQUEST' : 'INTERNAL_ERROR' }, { status });
  }
}
