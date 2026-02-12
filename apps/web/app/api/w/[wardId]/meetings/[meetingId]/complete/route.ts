import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canManageMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { runNotificationWorkerForWard } from '@/src/notifications/runner';

type AnnouncedBusinessLineRow = {
  id: string;
  member_name: string;
  calling_name: string;
  action_type: string;
};

export async function POST(_: Request, context: { params: Promise<{ wardId: string; meetingId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId, meetingId } = await context.params;
  if (!canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const meetingResult = await client.query(
      `SELECT id
         FROM meeting
        WHERE id = $1 AND ward_id = $2
        LIMIT 1
        FOR UPDATE`,
      [meetingId, wardId]
    );

    if (!meetingResult.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Meeting not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const announcedResult = await client.query(
      `SELECT id, member_name, calling_name, action_type
         FROM meeting_business_line
        WHERE ward_id = $1
          AND meeting_id = $2
          AND status = 'announced'
        ORDER BY created_at ASC`,
      [wardId, meetingId]
    );

    const announcedBusinessLines = (announcedResult.rows as AnnouncedBusinessLineRow[]).map((row) => ({
      id: row.id,
      memberName: row.member_name,
      callingName: row.calling_name,
      actionType: row.action_type
    }));

    await client.query(
      `UPDATE meeting
          SET status = 'COMPLETED',
              updated_at = now()
        WHERE id = $1 AND ward_id = $2`,
      [meetingId, wardId]
    );

    const outboxResult = await client.query(
      `INSERT INTO event_outbox (ward_id, aggregate_type, aggregate_id, event_type, payload)
       VALUES ($1, 'meeting', $2, 'MEETING_COMPLETED', $3::jsonb)
       ON CONFLICT (ward_id, event_type, aggregate_id)
       DO UPDATE SET payload = EXCLUDED.payload, updated_at = now(), status = 'pending'
       RETURNING id`,
      [wardId, meetingId, JSON.stringify({ meetingId, announcedBusinessLines })]
    );

    const eventOutboxId = outboxResult.rows[0].id as string;

    for (const line of announcedBusinessLines.filter((line) => line.actionType === 'RELEASE')) {
      await client.query(
        `INSERT INTO event_outbox (ward_id, aggregate_type, aggregate_id, event_type, payload)
         VALUES ($1, 'meeting_business_line', $2, 'CALLING_RELEASE_ANNOUNCED', $3::jsonb)
         ON CONFLICT (ward_id, event_type, aggregate_id)
         DO UPDATE SET payload = EXCLUDED.payload, updated_at = now(), status = 'pending'`,
        [
          wardId,
          line.id,
          JSON.stringify({
            meetingId,
            businessLineId: line.id,
            memberName: line.memberName,
            callingName: line.callingName,
            actionType: line.actionType
          })
        ]
      );
    }

    await runNotificationWorkerForWard(client, wardId);

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES (
         $1,
         $2,
         'MEETING_COMPLETED',
         jsonb_build_object('meetingId', $3, 'eventOutboxId', $4, 'announcedBusinessLineCount', $5)
       )`,
      [wardId, session.user.id, meetingId, eventOutboxId, announcedBusinessLines.length]
    );

    await client.query('COMMIT');

    return NextResponse.json({ success: true, meetingId, eventOutboxId, announcedBusinessLineCount: announcedBusinessLines.length });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to complete meeting', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
