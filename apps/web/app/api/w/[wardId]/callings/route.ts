import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canManageCallings, canViewCallings } from '@/src/auth/roles';
import { CALLING_STATUS } from '@/src/callings/lifecycle';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

type CallingRow = {
  id: string;
  member_name: string;
  calling_name: string;
  status: string;
  created_at: string;
};

export async function GET(_: Request, context: { params: Promise<{ wardId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId } = await context.params;
  if (!canViewCallings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const result = await client.query(
      `SELECT ca.id,
              ca.member_name,
              ca.calling_name,
              latest.action_status AS status,
              ca.created_at
         FROM calling_assignment ca
         JOIN LATERAL (
            SELECT action_status
              FROM calling_action
             WHERE calling_assignment_id = ca.id
               AND ward_id = ca.ward_id
             ORDER BY created_at DESC
             LIMIT 1
         ) latest ON TRUE
        WHERE ca.ward_id = $1
          AND ca.is_active = TRUE
        ORDER BY ca.created_at DESC`,
      [wardId]
    );

    await client.query('COMMIT');

    return NextResponse.json({
      callings: (result.rows as CallingRow[]).map((row) => ({
        id: row.id,
        memberName: row.member_name,
        callingName: row.calling_name,
        status: row.status,
        createdAt: row.created_at
      }))
    });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to load callings', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function POST(request: Request, context: { params: Promise<{ wardId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId } = await context.params;
  if (!canManageCallings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { memberName?: string; callingName?: string } | null;

  if (!body?.memberName?.trim() || !body.callingName?.trim()) {
    return NextResponse.json({ error: 'Invalid payload', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const assignmentResult = await client.query(
      `INSERT INTO calling_assignment (ward_id, member_name, calling_name)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [wardId, body.memberName.trim(), body.callingName.trim()]
    );

    const assignmentId = assignmentResult.rows[0].id as string;

    await client.query(
      `INSERT INTO calling_action (ward_id, calling_assignment_id, action_status)
       VALUES ($1, $2, $3)`,
      [wardId, assignmentId, CALLING_STATUS.PROPOSED]
    );

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES ($1, $2, 'CALLING_PROPOSED', jsonb_build_object('callingAssignmentId', $3))`,
      [wardId, session.user.id, assignmentId]
    );

    await client.query('COMMIT');

    return NextResponse.json({ id: assignmentId, status: CALLING_STATUS.PROPOSED }, { status: 201 });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to create calling', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
