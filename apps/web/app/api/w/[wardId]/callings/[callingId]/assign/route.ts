import { NextResponse } from 'next/server';

import { recordAuditEvent } from '@/src/audit/service';
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

    if (currentStatus === CALLING_STATUS.ASSIGNED) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Calling is already assigned', code: 'ALREADY_ASSIGNED' }, { status: 409 });
    }

    const transition = await appendCallingStatus(client, {
      wardId,
      callingId,
      fromStatus: currentStatus,
      toStatus: CALLING_STATUS.ASSIGNED
    });

    if (!transition.ok) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Invalid transition', code: transition.reason }, { status: 409 });
    }

    const callingInfo = await client.query(
      'SELECT ca.calling_name, ca.organization, ca.member_name, ca.member_id FROM calling_assignment ca WHERE ca.id = $1 AND ca.ward_id = $2',
      [callingId, wardId]
    );
    const callingRow = callingInfo?.rows?.[0];

    await recordAuditEvent(client, {
      wardId,
      userId: session.user.id,
      actorName: session.user.name || session.user.email || null,
      action: 'CALLING_ASSIGNED',
      targetMemberId: callingRow?.member_id || null,
      targetMemberName: callingRow?.member_name || null,
      entityType: 'calling',
      entityId: callingId,
      callingName: callingRow?.calling_name || null,
      organization: callingRow?.organization || null,
      callingStatus: CALLING_STATUS.ASSIGNED,
      changes: {
        status: { old: currentStatus, new: CALLING_STATUS.ASSIGNED }
      },
      details: {
        callingAssignmentId: callingId,
        fromStatus: currentStatus,
        toStatus: CALLING_STATUS.ASSIGNED
      },
      source: 'manual_ui',
      severity: 'notice'
    });

    await client.query('COMMIT');

    return NextResponse.json({ id: callingId, status: CALLING_STATUS.ASSIGNED, previousStatus: currentStatus });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to convert calling to assigned', { wardId, callingId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Failed to convert calling to assigned', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
