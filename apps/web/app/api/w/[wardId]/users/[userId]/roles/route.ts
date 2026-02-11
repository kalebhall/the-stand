import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { WARD_ROLES, canAssignRole, canManageWardUsers } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

export async function POST(request: Request, context: { params: Promise<{ wardId: string; userId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId, userId } = await context.params;
  if (!canManageWardUsers({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { roleName?: string } | null;
  const roleName = body?.roleName?.trim() ?? '';

  if (!roleName || !WARD_ROLES.includes(roleName as (typeof WARD_ROLES)[number])) {
    return NextResponse.json({ error: 'Invalid ward role', code: 'BAD_REQUEST' }, { status: 400 });
  }

  if (!canAssignRole(session.user.roles, roleName)) {
    return NextResponse.json({ error: 'Forbidden role assignment', code: 'FORBIDDEN' }, { status: 403 });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const roleResult = await client.query('SELECT id, scope FROM role WHERE name = $1 LIMIT 1', [roleName]);
    if (!roleResult.rowCount || roleResult.rows[0].scope !== 'WARD') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Role unavailable', code: 'BAD_REQUEST' }, { status: 400 });
    }

    const roleId = roleResult.rows[0].id as string;

    await client.query(
      `INSERT INTO ward_user_role (ward_id, user_id, role_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (ward_id, user_id, role_id) DO NOTHING`,
      [wardId, userId, roleId]
    );

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES ($1, $2, 'WARD_ROLE_ASSIGNED', jsonb_build_object('targetUserId', $3, 'roleName', $4))`,
      [wardId, session.user.id, userId, roleName]
    );

    await client.query('COMMIT');
    return NextResponse.json({ success: true });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to assign role', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
