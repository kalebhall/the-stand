import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canManageMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { renderInterviewCalendar, type InterviewCalendarEvent } from '@/src/leadership/interview-ics';

export async function GET(_: Request, context: { params: Promise<{ wardId: string }> }) {
  const { wardId } = await context.params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const result = await client.query(
      `SELECT id, interview_type, member_name, interviewer_name, scheduled_at
         FROM scheduled_interview
        WHERE ward_id = $1::uuid AND status = 'SCHEDULED'
        ORDER BY scheduled_at ASC`,
      [wardId]
    );
    await client.query('COMMIT');
    const calendar = renderInterviewCalendar(result.rows as InterviewCalendarEvent[]);
    return new NextResponse(calendar, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="the-stand-interviews.ics"',
        'Cache-Control': 'private, no-store'
      }
    });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to export interview calendar' }, { status: 500 });
  } finally {
    client.release();
  }
}
