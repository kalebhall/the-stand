import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canRunImports } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

const PERSON_ITEM_TYPES = ['PRESIDING', 'CONDUCTING', 'INVOCATION', 'BENEDICTION', 'SPEAKER'];

export async function PATCH(request: Request, context: { params: Promise<{ wardId: string; reviewId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  const { wardId, reviewId } = await context.params;
  if (!canRunImports({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId))
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { action?: string; memberId?: string } | null;
  const action = body?.action;
  if (action !== 'resolve' && action !== 'ignore')
    return NextResponse.json({ error: 'Action must be resolve or ignore', code: 'BAD_REQUEST' }, { status: 400 });
  if (action === 'resolve' && typeof body?.memberId !== 'string')
    return NextResponse.json({ error: 'A member is required to resolve a name', code: 'BAD_REQUEST' }, { status: 400 });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const review = await client.query(
      "SELECT source_name FROM historical_import_name_review WHERE id = $1::uuid AND ward_id = $2::uuid AND status = 'OPEN' LIMIT 1",
      [reviewId, wardId]
    );
    if (!review.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Review item not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    if (action === 'ignore') {
      await client.query(
        `UPDATE historical_import_name_review SET status = 'IGNORED', updated_at = now() WHERE id = $1::uuid AND ward_id = $2::uuid`,
        [reviewId, wardId]
      );
    } else {
      const member = await client.query('SELECT full_name FROM member WHERE id = $1::uuid AND ward_id = $2::uuid LIMIT 1', [
        body?.memberId,
        wardId
      ]);
      if (!member.rowCount) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Member not found in this ward', code: 'NOT_FOUND' }, { status: 404 });
      }
      await client.query(
        `UPDATE meeting_program_item
            SET title = $1::text
          WHERE ward_id = $2::uuid
            AND title = $3::text
            AND item_type = ANY($4::text[])`,
        [member.rows[0].full_name, wardId, review.rows[0].source_name, PERSON_ITEM_TYPES]
      );
      await client.query(
        `UPDATE historical_import_name_review SET status = 'RESOLVED', matched_member_id = $1::uuid, resolved_name = $2::text, updated_at = now() WHERE id = $3::uuid AND ward_id = $4::uuid`,
        [body?.memberId, member.rows[0].full_name, reviewId, wardId]
      );
    }
    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES ($1::uuid, $2::uuid, 'HISTORICAL_IMPORT_NAME_REVIEWED', $3::jsonb)`,
      [wardId, session.user.id, JSON.stringify({ reviewId, action })]
    );
    await client.query('COMMIT');
    return NextResponse.json({ success: true, action });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('historical_import_name_review_failed', { wardId, reviewId, userId: session.user.id, error });
    return NextResponse.json({ error: 'Failed to update name review', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
