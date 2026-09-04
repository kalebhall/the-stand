import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canManageMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { createLogger } from '@/src/lib/logger';
import { setDbContext } from '@/src/db/context';

const logger = createLogger('meetings');

type RouteContext = { params: Promise<{ wardId: string; meetingId: string; lineId: string }> };

/** PATCH /api/w/[wardId]/meetings/[meetingId]/business/[lineId]
 *  Marks a pending business line as 'announced'. */
export async function PATCH(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId, meetingId, lineId } = await context.params;
  if (!canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const result = await client.query(
      `UPDATE meeting_business_line
          SET status = 'announced', updated_at = now()
        WHERE id = $1::uuid AND meeting_id = $2::uuid AND ward_id = $3::uuid AND status = 'pending'
        RETURNING id`,
      [lineId, meetingId, wardId]
    );

    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Business line not found or already announced', code: 'NOT_FOUND' }, { status: 404 });
    }

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES ($1::uuid, $2::uuid, 'BUSINESS_LINE_ANNOUNCED', jsonb_build_object('meetingId', $3::text, 'lineId', $4::text))`,
      [wardId, session.user.id, meetingId, lineId]
    );

    await client.query('COMMIT');
    return NextResponse.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to announce business line', {
      wardId,
      meetingId,
      lineId,
      error: err instanceof Error ? err.message : String(err)
    });
    return NextResponse.json({ error: 'Failed to announce business line', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}

/** DELETE /api/w/[wardId]/meetings/[meetingId]/business/[lineId]
 *  Removes a business line (any status). */
export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId, meetingId, lineId } = await context.params;
  if (!canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const result = await client.query(
      `DELETE FROM meeting_business_line
        WHERE id = $1::uuid AND meeting_id = $2::uuid AND ward_id = $3::uuid
        RETURNING id`,
      [lineId, meetingId, wardId]
    );

    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Business line not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES ($1::uuid, $2::uuid, 'BUSINESS_LINE_REMOVED', jsonb_build_object('meetingId', $3::text, 'lineId', $4::text))`,
      [wardId, session.user.id, meetingId, lineId]
    );

    await client.query('COMMIT');
    return NextResponse.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to remove business line', { wardId, meetingId, lineId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Failed to remove business line', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
