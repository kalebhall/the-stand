import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { hashPassword, verifyPassword } from '@/src/auth/password';
import { pool } from '@/src/db/client';
import { enforceRateLimit } from '@/src/lib/rate-limit';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  if (!session.user.hasPassword) {
    return NextResponse.json({ error: 'Password login is not available for this account', code: 'PASSWORD_NOT_AVAILABLE' }, { status: 403 });
  }

  const ip = request.headers.get('x-forwarded-for') ?? 'unknown-ip';
  if (!enforceRateLimit(`account:change-password:${session.user.id}:${ip}`, 10)) {
    return NextResponse.json({ error: 'Too many requests', code: 'RATE_LIMITED' }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as
    | { currentPassword?: string; newPassword?: string }
    | null;

  const currentPassword = body?.currentPassword?.trim() ?? '';
  const newPassword = body?.newPassword?.trim() ?? '';

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'Both currentPassword and newPassword are required', code: 'BAD_REQUEST' }, { status: 400 });
  }

  if (newPassword.length < 12) {
    return NextResponse.json({ error: 'New password must be at least 12 characters', code: 'WEAK_PASSWORD' }, { status: 400 });
  }

  const userResult = await pool.query('SELECT password_hash FROM user_account WHERE id = $1 AND is_active = true LIMIT 1', [
    session.user.id
  ]);

  if (!userResult.rowCount || !userResult.rows[0].password_hash) {
    return NextResponse.json({ error: 'Password login is not available for this account', code: 'PASSWORD_NOT_AVAILABLE' }, { status: 403 });
  }

  const passwordMatches = await verifyPassword(userResult.rows[0].password_hash as string, currentPassword);
  if (!passwordMatches) {
    return NextResponse.json({ error: 'Current password is incorrect', code: 'INVALID_CREDENTIALS' }, { status: 400 });
  }

  const passwordHash = await hashPassword(newPassword);
  await pool.query(
    'UPDATE user_account SET password_hash = $1, must_change_password = false, last_password_change_at = NOW() WHERE id = $2',
    [passwordHash, session.user.id]
  );

  await pool.query(
    `INSERT INTO audit_log (ward_id, user_id, action, details)
     VALUES (NULL, $1, 'ACCOUNT_PASSWORD_CHANGED', jsonb_build_object('source', 'self_service'))`,
    [session.user.id]
  );

  return NextResponse.json({ success: true });
}
