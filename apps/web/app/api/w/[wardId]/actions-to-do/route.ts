import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canViewMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { isWardModuleEnabled } from '@/src/modules/service';

const allowedStatuses = new Set(['OPEN', 'IN_PROGRESS', 'COMPLETED', 'NOT_APPLICABLE']);

export async function GET(request: Request, context: { params: Promise<{ wardId: string }> }) {
  const session = await auth();
  const { wardId } = await context.params;
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  if (!canViewMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId) || !(await isWardModuleEnabled(wardId, session.user.id, 'actions-to-do'))) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const family = url.searchParams.get('family');
  if ((status && !allowedStatuses.has(status)) || (family && !['CALLING', 'MEMBERSHIP', 'PRIESTHOOD'].includes(family))) {
    return NextResponse.json({ error: 'Invalid action filter', code: 'BAD_REQUEST' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const result = await client.query(
      `SELECT id, family, action_type, status, member_name, calling_assignment_id,
              membership_ordinance_id, source_event, source_event_id, description,
              official_system, official_reference_url, due_date, completed_at,
              completed_by_user_id, created_at, updated_at
         FROM church_action_follow_up
        WHERE ward_id = $1::uuid
          AND ($2::text IS NULL OR status = $2::text)
          AND ($3::text IS NULL OR family = $3::text)
        ORDER BY CASE WHEN status IN ('OPEN', 'IN_PROGRESS') THEN 0 ELSE 1 END,
                 due_date NULLS LAST, created_at ASC`,
      [wardId, status, family]
    );
    await client.query('COMMIT');
    return NextResponse.json({ actions: result.rows });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('church_action_follow_up_list_failed', { wardId, error });
    return NextResponse.json({ error: 'Failed to load Actions to Do', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
