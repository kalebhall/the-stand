import { NextResponse } from 'next/server';

import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { hashInterviewCalendarToken } from '@/src/leadership/interview-calendar-subscriptions';
import { renderInterviewCalendar, type InterviewCalendarEvent } from '@/src/leadership/interview-ics';

export async function GET(_: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const normalizedToken = token.trim();
  if (!normalizedToken) return new NextResponse('Not found', { status: 404 });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.interview_calendar_token_hash', hashInterviewCalendarToken(normalizedToken)]);
    const subscription = await client.query(
      `SELECT ward_id, created_by_user_id
         FROM interview_calendar_subscription
        WHERE token_hash = $1::text AND revoked_at IS NULL
        LIMIT 1`,
      [hashInterviewCalendarToken(normalizedToken)]
    );
    const row = subscription.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return new NextResponse('Not found', { status: 404 });
    }
    await setDbContext(client, { userId: row.created_by_user_id, wardId: row.ward_id });
    const interviews = await client.query(
      `SELECT id, interview_type, member_name, interviewer_name, scheduled_at
         FROM scheduled_interview
        WHERE ward_id = $1::uuid AND status = 'SCHEDULED'
        ORDER BY scheduled_at ASC`,
      [row.ward_id]
    );
    await client.query('COMMIT');
    const calendar = renderInterviewCalendar(interviews.rows as InterviewCalendarEvent[]);
    return new NextResponse(calendar, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Cache-Control': 'private, no-store'
      }
    });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return new NextResponse('Calendar unavailable', { status: 500 });
  } finally {
    client.release();
  }
}
