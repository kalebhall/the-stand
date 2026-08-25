import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canRunImports } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { createLogger } from '@/src/lib/logger';
import { setDbContext } from '@/src/db/context';

const logger = createLogger('ward-audit-log');

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;

type AuditLogRow = {
  id: string;
  user_id: string | null;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
  user_email: string | null;
  user_display_name: string | null;
};

export async function GET(request: NextRequest, context: { params: Promise<{ wardId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId } = await context.params;

  if (!canRunImports({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(searchParams.get('pageSize') ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * pageSize;
  const actionFilter = searchParams.get('action')?.trim() || null;
  const search = searchParams.get('search')?.trim() || null;
  const dateFrom = searchParams.get('dateFrom')?.trim() || null;
  const dateTo = searchParams.get('dateTo')?.trim() || null;

  const conditions: string[] = ['al.ward_id = $1'];
  const params: unknown[] = [wardId];
  let paramIndex = 2;

  if (actionFilter) {
    conditions.push(`al.action = $${paramIndex}`);
    params.push(actionFilter);
    paramIndex++;
  }

  if (search) {
    conditions.push(`(al.action ILIKE $${paramIndex} OR ua.email ILIKE $${paramIndex} OR ua.display_name ILIKE $${paramIndex} OR al.details::text ILIKE $${paramIndex})`);
    params.push(`%${search}%`);
    paramIndex++;
  }

  if (dateFrom) {
    conditions.push(`al.created_at >= $${paramIndex}::timestamptz`);
    params.push(dateFrom);
    paramIndex++;
  }

  if (dateTo) {
    conditions.push(`al.created_at < ($${paramIndex}::date + INTERVAL '1 day')`);
    params.push(dateTo);
    paramIndex++;
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const [countResult, dataResult, actionsResult] = await Promise.all([
      client.query(
        `SELECT COUNT(*) AS total FROM audit_log al LEFT JOIN user_account ua ON ua.id = al.user_id ${whereClause}`,
        params
      ),
      client.query(
        `SELECT al.id,
                al.user_id,
                al.action,
                al.details,
                al.created_at,
                ua.email AS user_email,
                ua.display_name AS user_display_name
           FROM audit_log al
           LEFT JOIN user_account ua ON ua.id = al.user_id
          ${whereClause}
          ORDER BY al.created_at DESC
          LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, pageSize, offset]
      ),
      client.query(
        'SELECT DISTINCT action FROM audit_log WHERE ward_id = $1 ORDER BY action ASC',
        [wardId]
      )
    ]);

    await client.query('COMMIT');

    const total = parseInt(String(countResult.rows[0]?.total ?? '0'), 10);

    return NextResponse.json({
      items: (dataResult.rows as AuditLogRow[]).map((row) => ({
        id: row.id,
        userId: row.user_id,
        action: row.action,
        details: row.details,
        createdAt: row.created_at,
        userEmail: row.user_email,
        userDisplayName: row.user_display_name
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      distinctActions: (actionsResult.rows as { action: string }[]).map((r) => r.action)
    });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to fetch ward audit log', { wardId, userId: session.user.id, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Failed to fetch activity log', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
