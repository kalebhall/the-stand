import { NextResponse } from 'next/server';

import { recordAuditEvent } from '@/src/audit/service';
import { auth } from '@/src/auth/auth';
import { canManageMeetings } from '@/src/auth/roles';
import { isMeetingStatus, transitionMeetingStatus } from '@/src/conducting/model';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { createLogger } from '@/src/lib/logger';

const logger = createLogger('meetings');

function isReopenTransitionError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('Cannot reopen a ');
}

export async function POST(_: Request, context: { params: Promise<{ wardId: string; meetingId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  const { wardId, meetingId } = await context.params;
  if (!canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const current = await client.query(
      'SELECT id, status FROM meeting WHERE id = $1::uuid AND ward_id = $2::uuid LIMIT 1 FOR UPDATE',
      [meetingId, wardId]
    );
    if (!current.rows[0]) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Meeting not found', code: 'NOT_FOUND' }, { status: 404 });
    }
    const status = String(current.rows[0].status);
    if (!isMeetingStatus(status)) throw new Error('Meeting has an invalid status.');
    const nextStatus = transitionMeetingStatus(status, 'reopen');
    await client.query(
      'UPDATE meeting SET status = $3::text, updated_at = now() WHERE id = $1::uuid AND ward_id = $2::uuid',
      [meetingId, wardId, nextStatus]
    );
    await recordAuditEvent(client, {
      wardId,
      userId: session.user.id,
      actorName: session.user.name || session.user.email || null,
      action: 'MEETING_REOPENED',
      entityType: 'meeting',
      entityId: meetingId,
      changes: { status: { old: status, new: nextStatus } },
      details: { meetingId },
      source: 'manual_ui',
      severity: 'notice'
    });
    await client.query('COMMIT');
    return NextResponse.json({ success: true, meetingId, status: nextStatus });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (isReopenTransitionError(error)) {
      return NextResponse.json({ error: 'Meeting cannot be reopened in its current state', code: 'INVALID_TRANSITION' }, { status: 409 });
    }
    logger.error('Failed to reopen meeting', { wardId, meetingId, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to reopen meeting', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
