import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canManageCallings } from '@/src/auth/roles';
import { CALLING_STATUS } from '@/src/callings/lifecycle';
import { appendCallingStatus, fetchCurrentCallingStatus } from '@/src/callings/transition';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { runNotificationWorkerForWard } from '@/src/notifications/runner';

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
      toStatus: CALLING_STATUS.SET_APART
    });

    if (!transition.ok) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Invalid transition', code: transition.reason }, { status: 409 });
    }

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES (
         $1,
         $2,
         'CALLING_SET_APART',
         jsonb_build_object(
           'callingAssignmentId',
           $3,
           'lcrReminder',
           'Please record this set apart action in LCR.'
         )
       )`,
      [wardId, session.user.id, callingId]
    );

    await client.query(
      `INSERT INTO event_outbox (ward_id, aggregate_type, aggregate_id, event_type, payload)
       VALUES ($1, 'calling_assignment', $2, 'CALLING_SET_APART', $3::jsonb)
       ON CONFLICT (ward_id, event_type, aggregate_id)
       DO UPDATE SET payload = EXCLUDED.payload, updated_at = now(), status = 'pending'`,
      [
        wardId,
        callingId,
        JSON.stringify({
          callingAssignmentId: callingId,
          instruction: 'Please record this set apart action in LCR.'
        })
      ]
    );

    await runNotificationWorkerForWard(client, wardId);

    await client.query('COMMIT');

    return NextResponse.json({ id: callingId, status: CALLING_STATUS.SET_APART });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to mark set apart', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
