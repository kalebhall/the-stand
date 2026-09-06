import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';

import { auth } from '@/src/auth/auth';
import { canManageMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { hashInterviewCalendarToken, interviewCalendarFeedUrl } from '@/src/leadership/interview-calendar-subscriptions';

async function authorize(wardId: string) {
  const session = await auth();
  if (!session?.user?.id) return { response: NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 }) };
  if (!canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return { response: NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 }) };
  }
  return { session };
}

export async function GET(_: Request, context: { params: Promise<{ wardId: string }> }) {
  const { wardId } = await context.params;
  const access = await authorize(wardId);
  if (access.response) return access.response;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: access.session.user.id, wardId });
    const result = await client.query(
      `SELECT id, created_at, revoked_at
         FROM interview_calendar_subscription
        WHERE ward_id = $1::uuid AND revoked_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
      [wardId]
    );
    await client.query('COMMIT');
    return NextResponse.json({ subscription: result.rows[0] ?? null });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to load calendar subscription', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function POST(_: Request, context: { params: Promise<{ wardId: string }> }) {
  const { wardId } = await context.params;
  const access = await authorize(wardId);
  if (access.response) return access.response;
  const token = randomBytes(32).toString('base64url');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: access.session.user.id, wardId });
    await client.query(
      `UPDATE interview_calendar_subscription
          SET revoked_at = now()
        WHERE ward_id = $1::uuid AND revoked_at IS NULL`,
      [wardId]
    );
    const result = await client.query(
      `INSERT INTO interview_calendar_subscription (ward_id, token_hash, created_by_user_id)
       VALUES ($1::uuid, $2::text, $3::uuid)
       RETURNING id, created_at`,
      [wardId, hashInterviewCalendarToken(token), access.session.user.id]
    );
    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES ($1::uuid, $2::uuid, 'INTERVIEW_CALENDAR_TOKEN_ROTATED', jsonb_build_object('action', 'create_or_rotate'))`,
      [wardId, access.session.user.id]
    );
    await client.query('COMMIT');
    return NextResponse.json({ subscription: result.rows[0], feedUrl: interviewCalendarFeedUrl(token) });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to create calendar subscription', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ wardId: string }> }) {
  const { wardId } = await context.params;
  const access = await authorize(wardId);
  if (access.response) return access.response;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: access.session.user.id, wardId });
    await client.query(
      `UPDATE interview_calendar_subscription
          SET revoked_at = now()
        WHERE ward_id = $1::uuid AND revoked_at IS NULL`,
      [wardId]
    );
    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES ($1::uuid, $2::uuid, 'INTERVIEW_CALENDAR_TOKEN_REVOKED', jsonb_build_object('action', 'revoke'))`,
      [wardId, access.session.user.id]
    );
    await client.query('COMMIT');
    return new NextResponse(null, { status: 204 });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to revoke calendar subscription', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
