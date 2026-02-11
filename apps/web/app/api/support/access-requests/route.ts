import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { hasRole } from '@/src/auth/roles';
import { pool } from '@/src/db/client';

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  if (!hasRole(session.user.roles, 'SUPPORT_ADMIN')) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const result = await pool.query(
    `SELECT id, name, email, stake, ward, message, created_at
     FROM access_request
     ORDER BY created_at DESC`
  );

  await pool.query(
    `INSERT INTO audit_log (ward_id, user_id, action, details)
     VALUES (NULL, $1, 'SUPPORT_ACCESS_REQUESTS_VIEWED', jsonb_build_object('count', $2::int))`,
    [session.user.id, result.rowCount ?? 0]
  );

  return NextResponse.json({
    items: result.rows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      email: row.email as string,
      stake: row.stake as string,
      ward: row.ward as string,
      message: row.message as string,
      createdAt: row.created_at as string
    }))
  });
}
