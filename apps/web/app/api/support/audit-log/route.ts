import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { hasRole } from '@/src/auth/roles';
import { pool } from '@/src/db/client';

type AuditLogRow = {
  id: string;
  ward_id: string | null;
  user_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  target_member_id: string | null;
  target_member_name: string | null;
  entity_type: string | null;
  entity_id: string | null;
  changes: Record<string, { old: unknown; new: unknown }> | null;
  previous_state: Record<string, unknown> | null;
  details: Record<string, unknown> | null;
  source: string | null;
  severity: string | null;
  is_cross_ward_support: boolean | null;
  calling_name: string | null;
  organization: string | null;
  calling_status: string | null;
  meeting_date: string | null;
  item_type: string | null;
  item_title: string | null;
  created_at: string;
  user_email: string | null;
  user_display_name: string | null;
  ward_name: string | null;
};

const VALID_SORT_COLUMNS = [
  'created_at',
  'action',
  'user_email',
  'ward_name',
  'entity_type',
  'severity',
  'source',
  'target_member_name'
] as const;
type SortColumn = (typeof VALID_SORT_COLUMNS)[number];

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  if (!hasRole(session.user.roles, 'SUPPORT_ADMIN')) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(searchParams.get('pageSize') ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE)
  );
  const offset = (page - 1) * pageSize;

  const actionFilter = searchParams.get('action')?.trim() || null;
  const userFilter = searchParams.get('user')?.trim() || null;
  const wardFilter = searchParams.get('ward')?.trim() || null;
  const entityTypeFilter = searchParams.get('entityType')?.trim() || null;
  const severityFilter = searchParams.get('severity')?.trim() || null;
  const sourceFilter = searchParams.get('source')?.trim() || null;
  const memberFilter = searchParams.get('member')?.trim() || null;
  const search = searchParams.get('search')?.trim() || null;
  const dateFrom = searchParams.get('dateFrom')?.trim() || null;
  const dateTo = searchParams.get('dateTo')?.trim() || null;

  const sortParam = searchParams.get('sort')?.trim() || 'created_at';
  const sortColumn: SortColumn = VALID_SORT_COLUMNS.includes(sortParam as SortColumn)
    ? (sortParam as SortColumn)
    : 'created_at';
  const sortDir = searchParams.get('dir')?.trim().toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (actionFilter) {
    conditions.push(`al.action = $${paramIndex}`);
    params.push(actionFilter);
    paramIndex++;
  }

  if (entityTypeFilter) {
    conditions.push(`al.entity_type = $${paramIndex}`);
    params.push(entityTypeFilter);
    paramIndex++;
  }

  if (severityFilter) {
    conditions.push(`al.severity = $${paramIndex}`);
    params.push(severityFilter);
    paramIndex++;
  }

  if (sourceFilter) {
    conditions.push(`al.source = $${paramIndex}`);
    params.push(sourceFilter);
    paramIndex++;
  }

  if (memberFilter) {
    conditions.push(`al.target_member_name ILIKE $${paramIndex}`);
    params.push(`%${memberFilter}%`);
    paramIndex++;
  }

  if (userFilter) {
    conditions.push(`(ua.email ILIKE $${paramIndex} OR ua.display_name ILIKE $${paramIndex} OR al.actor_name ILIKE $${paramIndex})`);
    params.push(`%${userFilter}%`);
    paramIndex++;
  }

  if (wardFilter) {
    conditions.push(`w.name ILIKE $${paramIndex}`);
    params.push(`%${wardFilter}%`);
    paramIndex++;
  }

  if (search) {
    conditions.push(
      `(al.action ILIKE $${paramIndex} OR ua.email ILIKE $${paramIndex} OR ua.display_name ILIKE $${paramIndex} OR al.actor_name ILIKE $${paramIndex} OR al.target_member_name ILIKE $${paramIndex} OR al.calling_name ILIKE $${paramIndex} OR w.name ILIKE $${paramIndex} OR al.details::text ILIKE $${paramIndex} OR al.changes::text ILIKE $${paramIndex})`
    );
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

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sortColumnMap: Record<SortColumn, string> = {
    created_at: 'al.created_at',
    action: 'al.action',
    user_email: 'ua.email',
    ward_name: 'w.name',
    entity_type: 'al.entity_type',
    severity: 'al.severity',
    source: 'al.source',
    target_member_name: 'al.target_member_name'
  };

  const dbSortCol = sortColumnMap[sortColumn] || 'al.created_at';

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.user_id', session.user.id]);
    await client.query('SELECT set_config($1, $2, true)', ['app.ward_id', '']);

    const countQuery = `
      SELECT COUNT(*) AS total
        FROM audit_log al
        LEFT JOIN user_account ua ON ua.id = al.user_id
        LEFT JOIN ward w ON w.id = al.ward_id
       ${whereClause}
    `;

    const dataQuery = `
      SELECT al.id,
             al.ward_id,
             al.user_id,
             al.actor_name,
             al.actor_role,
             al.action,
             al.target_member_id,
             al.target_member_name,
             al.entity_type,
             al.entity_id,
             al.changes,
             al.previous_state,
             al.details,
             al.source,
             al.severity,
             al.is_cross_ward_support,
             al.calling_name,
             al.organization,
             al.calling_status,
             al.meeting_date,
             al.item_type,
             al.item_title,
             al.created_at,
             ua.email AS user_email,
             ua.display_name AS user_display_name,
             w.name AS ward_name
        FROM audit_log al
        LEFT JOIN user_account ua ON ua.id = al.user_id
        LEFT JOIN ward w ON w.id = al.ward_id
       ${whereClause}
       ORDER BY ${dbSortCol} ${sortDir} NULLS LAST, al.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const [countResult, dataResult] = await Promise.all([
      client.query(countQuery, params),
      client.query(dataQuery, [...params, pageSize, offset])
    ]);

    await client.query('COMMIT');

    const total = parseInt(String(countResult.rows[0]?.total ?? '0'), 10);

    const items = (dataResult.rows as AuditLogRow[]).map((row) => ({
      id: row.id,
      wardId: row.ward_id,
      userId: row.user_id,
      actorName: row.actor_name,
      actorRole: row.actor_role,
      action: row.action,
      targetMemberId: row.target_member_id,
      targetMemberName: row.target_member_name,
      entityType: row.entity_type,
      entityId: row.entity_id,
      changes: row.changes,
      previousState: row.previous_state,
      details: row.details,
      source: row.source,
      severity: row.severity,
      isCrossWardSupport: Boolean(row.is_cross_ward_support),
      callingName: row.calling_name,
      organization: row.organization,
      callingStatus: row.calling_status,
      meetingDate: row.meeting_date,
      itemType: row.item_type,
      itemTitle: row.item_title,
      createdAt: row.created_at,
      userEmail: row.user_email,
      userDisplayName: row.user_display_name,
      wardName: row.ward_name
    }));

    return NextResponse.json({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to query audit log:', error);
    return NextResponse.json({ error: 'Failed to load audit log', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
