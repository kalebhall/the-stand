import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';

import { auth } from '@/src/auth/auth';
import { hasRole } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

export async function GET(_: Request, context: { params: Promise<{ wardId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId } = await context.params;
  if (!hasRole(session.user.roles, 'STAND_ADMIN') && !hasRole(session.user.roles, 'SUPPORT_ADMIN')) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const portalResult = await client.query(
      'SELECT id, token, created_at FROM public_program_portal WHERE ward_id = $1 LIMIT 1',
      [wardId]
    );

    const sharesResult = await client.query(
      `SELECT pps.id, pps.meeting_id, pps.token, m.meeting_date, m.meeting_type, pps.created_at
         FROM public_program_share pps
         JOIN meeting m ON m.id = pps.meeting_id
        WHERE pps.ward_id = $1
        ORDER BY m.meeting_date DESC
        LIMIT 20`,
      [wardId]
    );

    await client.query('COMMIT');

    return NextResponse.json({
      portal: portalResult.rows[0] ?? null,
      shares: sharesResult.rows
    });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to load portal data', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function POST(_: Request, context: { params: Promise<{ wardId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId } = await context.params;
  if (!hasRole(session.user.roles, 'STAND_ADMIN') && !hasRole(session.user.roles, 'SUPPORT_ADMIN')) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const newToken = randomBytes(24).toString('base64url');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    await client.query(
      `INSERT INTO public_program_portal (ward_id, token)
       VALUES ($1, $2)
       ON CONFLICT (ward_id)
       DO UPDATE SET token = EXCLUDED.token`,
      [wardId, newToken]
    );

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES ($1, $2, 'PORTAL_TOKEN_ROTATED', jsonb_build_object('action', 'create_or_rotate'))`,
      [wardId, session.user.id]
    );

    await client.query('COMMIT');

    return NextResponse.json({ success: true, token: newToken });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to create portal token', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ wardId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId } = await context.params;
  if (!hasRole(session.user.roles, 'STAND_ADMIN') && !hasRole(session.user.roles, 'SUPPORT_ADMIN')) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    await client.query('DELETE FROM public_program_portal WHERE ward_id = $1', [wardId]);

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES ($1, $2, 'PORTAL_TOKEN_REVOKED', jsonb_build_object('action', 'revoke'))`,
      [wardId, session.user.id]
    );

    await client.query('COMMIT');

    return new NextResponse(null, { status: 204 });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to revoke portal token', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
