import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canRunImports } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

export async function GET(_: Request, context: { params: Promise<{ wardId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  const { wardId } = await context.params;
  if (!canRunImports({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const [reviews, members] = await Promise.all([
      client.query(`SELECT r.id, r.source_name, r.occurrence_count, r.first_seen_date, r.last_seen_date, r.status, r.resolved_name
                      FROM historical_import_name_review r
                     WHERE r.ward_id = $1::uuid AND r.status = 'OPEN'
                     ORDER BY r.source_name`, [wardId]),
      client.query(`SELECT id, full_name FROM member WHERE ward_id = $1::uuid ORDER BY full_name`, [wardId])
    ]);
    await client.query('COMMIT');
    return NextResponse.json({ reviews: reviews.rows, members: members.rows });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to load name review queue', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
