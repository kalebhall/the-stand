import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canViewCallings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { fetchNotificationDiagnostics } from '@/src/notifications/diagnostics';

export async function GET(request: Request, context: { params: Promise<{ wardId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId } = await context.params;
  if (!canViewCallings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const limitParam = new URL(request.url).searchParams.get('limit');
  const limit = Math.min(100, Math.max(1, Number(limitParam ?? '25')));

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const deliveries = await fetchNotificationDiagnostics(client, wardId, limit);
    await client.query('COMMIT');
    return NextResponse.json({ deliveries });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to load notification diagnostics', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
