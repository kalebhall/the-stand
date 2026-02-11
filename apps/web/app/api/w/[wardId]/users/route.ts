import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canManageWardUsers } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

type WardUserRow = {
  id: string;
  email: string;
  display_name: string | null;
  is_active: boolean;
  role_id: string;
  role_name: string;
};

export async function GET(_: Request, context: { params: Promise<{ wardId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId } = await context.params;
  if (!canManageWardUsers({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const result = await client.query(
      `SELECT
         ua.id,
         ua.email,
         ua.display_name,
         ua.is_active,
         r.id AS role_id,
         r.name AS role_name
       FROM ward_user_role wur
       INNER JOIN user_account ua ON ua.id = wur.user_id
       INNER JOIN role r ON r.id = wur.role_id
       WHERE wur.ward_id = $1
       ORDER BY ua.email ASC, r.name ASC`,
      [wardId]
    );

    await client.query('COMMIT');

    const users = new Map<string, { id: string; email: string; displayName: string | null; isActive: boolean; roles: { id: string; name: string }[] }>();

    for (const row of result.rows as WardUserRow[]) {
      const existing = users.get(row.id);
      if (existing) {
        existing.roles.push({ id: row.role_id, name: row.role_name });
        continue;
      }

      users.set(row.id, {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        isActive: Boolean(row.is_active),
        roles: [{ id: row.role_id, name: row.role_name }]
      });
    }

    return NextResponse.json({ users: Array.from(users.values()) });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to load ward users', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
