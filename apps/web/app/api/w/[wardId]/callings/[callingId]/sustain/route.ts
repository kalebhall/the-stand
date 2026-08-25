import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canManageCallings } from '@/src/auth/roles';
import { CALLING_STATUS } from '@/src/callings/lifecycle';
import { appendCallingStatus, fetchCurrentCallingStatus } from '@/src/callings/transition';
import { pool } from '@/src/db/client';
import { createLogger } from '@/src/lib/logger';
import { setDbContext } from '@/src/db/context';

const logger = createLogger('callings');

export async function POST(_: Request, context: { params: Promise<{ wardId: string; callingId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId, callingId } = await context.params;
  if (!canManageCallings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const currentStatus = await fetchCurrentCallingStatus(client, wardId, callingId);
    if (!currentStatus) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Calling not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const transition = await appendCallingStatus(client, {
      wardId,
      callingId,
      fromStatus: currentStatus,
      toStatus: CALLING_STATUS.SUSTAINED
    });

    if (!transition.ok) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Invalid transition', code: transition.reason }, { status: 409 });
    }

    // Business line was already added to the meeting when the calling was extended.
    // Just record the status change here — the ward has now voted to sustain.
    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES (
         $1::uuid,
         $2::uuid,
         'CALLING_SUSTAINED',
         jsonb_build_object('callingAssignmentId', $3::text)
       )`,
      [wardId, session.user.id, callingId]
    );

    await client.query('COMMIT');

    return NextResponse.json({ id: callingId, status: CALLING_STATUS.SUSTAINED });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to sustain calling', { wardId, callingId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Failed to sustain calling', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
