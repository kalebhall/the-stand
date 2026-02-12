import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { hasRole } from '@/src/auth/roles';
import { pool } from '@/src/db/client';

type AccessRequestRow = {
  id: string;
  name: string;
  email: string;
  stake: string;
  ward: string;
  message: string;
  created_at: string;
};

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  if (!hasRole(session.user.roles, 'SUPPORT_ADMIN')) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const result = await pool.query<AccessRequestRow>(
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
    items: result.rows.map((row: AccessRequestRow) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      stake: row.stake,
      ward: row.ward,
      message: row.message,
      createdAt: row.created_at
    }))
  });
}
