import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { CALLING_STATUS } from '@/src/callings/lifecycle';
import { appendCallingStatus, fetchCurrentCallingStatus } from '@/src/callings/transition';
import { canManageCallings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { createLogger } from '@/src/lib/logger';
import { setDbContext } from '@/src/db/context';

const logger = createLogger('callings');

type CallingAssignmentRow = {
  member_name: string;
  calling_name: string;
};

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
      toStatus: CALLING_STATUS.EXTENDED
    });

    if (!transition.ok) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Invalid transition', code: transition.reason }, { status: 409 });
    }

    // Queue a sustain vote in the next upcoming sacrament meeting.
    // The calling was extended — it should appear on the meeting agenda for congregational sustaining.
    const assignmentResult = await client.query(
      'SELECT member_name, calling_name FROM calling_assignment WHERE id = $1 AND ward_id = $2 LIMIT 1',
      [callingId, wardId]
    );
    const assignment = assignmentResult.rows[0] as CallingAssignmentRow | undefined;

    const meetingResult = await client.query(
      `SELECT id FROM meeting WHERE ward_id = $1 AND meeting_date >= CURRENT_DATE ORDER BY meeting_date ASC LIMIT 1`,
      [wardId]
    );

    let meetingId: string | null = null;
    if (meetingResult.rowCount && assignment) {
      meetingId = meetingResult.rows[0].id as string;
      await client.query(
        `INSERT INTO meeting_business_line (ward_id, meeting_id, member_name, calling_name, action_type, status)
         VALUES ($1, $2, $3, $4, 'SUSTAIN', 'pending')`,
        [wardId, meetingId, assignment.member_name, assignment.calling_name]
      );
    }

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES ($1::uuid, $2::uuid, 'CALLING_EXTENDED', jsonb_build_object('callingAssignmentId', $3::text, 'meetingId', $4::text))`,
      [wardId, session.user.id, callingId, meetingId]
    );

    await client.query('COMMIT');

    return NextResponse.json({ id: callingId, status: CALLING_STATUS.EXTENDED, meetingId });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to extend calling', { wardId, callingId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Failed to extend calling', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
