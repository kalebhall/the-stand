import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canManageCallings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { createLogger } from '@/src/lib/logger';

const logger = createLogger('members');
import { setDbContext } from '@/src/db/context';

type MemberPatchBody = {
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  phone?: unknown;
};

// Archive member (soft delete) — keeps historical records intact
export async function DELETE(_request: Request, context: { params: Promise<{ wardId: string; memberId: string }> }) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId, memberId } = await context.params;

  if (!canManageCallings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const memberResult = await client.query(
      'SELECT id, full_name FROM member WHERE id = $1 AND ward_id = $2 AND archived_at IS NULL LIMIT 1',
      [memberId, wardId]
    );

    if (!memberResult.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Member not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    await client.query(
      'UPDATE member SET archived_at = now(), updated_at = now() WHERE id = $1 AND ward_id = $2',
      [memberId, wardId]
    );

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES ($1, $2, 'MEMBER_ARCHIVED', jsonb_build_object('memberId', $3::text, 'memberName', $4::text))`,
      [wardId, session.user.id, memberId, memberResult.rows[0].full_name]
    );

    await client.query('COMMIT');

    return NextResponse.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to archive member', { wardId, memberId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Failed to archive member', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}

// Update editable member fields (firstName, lastName, email, phone)
export async function PATCH(request: Request, context: { params: Promise<{ wardId: string; memberId: string }> }) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId, memberId } = await context.params;

  if (!canManageCallings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as MemberPatchBody | null;
  if (!body) {
    return NextResponse.json({ error: 'Invalid request body', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  const firstName = typeof body.firstName === 'string' ? body.firstName.trim() || null : undefined;
  const lastName = typeof body.lastName === 'string' ? body.lastName.trim() || null : undefined;
  const email = typeof body.email === 'string' ? body.email.trim() || null : undefined;
  const phone = typeof body.phone === 'string' ? body.phone.trim() || null : undefined;

  if (firstName === undefined && lastName === undefined && email === undefined && phone === undefined) {
    return NextResponse.json({ error: 'No fields to update', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const memberResult = await client.query(
      'SELECT id, full_name FROM member WHERE id = $1 AND ward_id = $2 AND archived_at IS NULL LIMIT 1',
      [memberId, wardId]
    );

    if (!memberResult.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Member not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    // Build dynamic SET clause for only the provided fields
    const setClauses: string[] = ['updated_at = now()'];
    const values: (string | null)[] = [];
    let paramIdx = 3; // $1 = memberId, $2 = wardId

    if (firstName !== undefined) {
      setClauses.push(`first_name = $${paramIdx++}::text`);
      values.push(firstName);
    }
    if (lastName !== undefined) {
      setClauses.push(`last_name = $${paramIdx++}::text`);
      values.push(lastName);
    }
    if (email !== undefined) {
      setClauses.push(`email = $${paramIdx++}::text`);
      values.push(email);
    }
    if (phone !== undefined) {
      setClauses.push(`phone = $${paramIdx++}::text`);
      values.push(phone);
    }

    await client.query(
      `UPDATE member SET ${setClauses.join(', ')} WHERE id = $1 AND ward_id = $2`,
      [memberId, wardId, ...values]
    );

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES ($1, $2, 'MEMBER_UPDATED', jsonb_build_object('memberId', $3::text, 'memberName', $4::text))`,
      [wardId, session.user.id, memberId, memberResult.rows[0].full_name]
    );

    await client.query('COMMIT');

    return NextResponse.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to update member', { wardId, memberId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Failed to update member', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
