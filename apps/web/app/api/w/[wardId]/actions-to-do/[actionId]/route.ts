import { NextResponse } from 'next/server';

import { recordAuditEvent } from '@/src/audit/service';
import { auth } from '@/src/auth/auth';
import { canManageMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { isWardModuleEnabled } from '@/src/modules/service';

const allowedStatuses = new Set(['OPEN', 'IN_PROGRESS', 'COMPLETED', 'NOT_APPLICABLE']);

export async function PATCH(request: Request, context: { params: Promise<{ wardId: string; actionId: string }> }) {
  const session = await auth();
  const { wardId, actionId } = await context.params;
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  if (!canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId) || !(await isWardModuleEnabled(wardId, session.user.id, 'actions-to-do'))) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { status?: unknown } | null;
  const status = typeof body?.status === 'string' ? body.status.trim().toUpperCase() : '';
  if (!allowedStatuses.has(status)) return NextResponse.json({ error: 'Invalid action status', code: 'BAD_REQUEST' }, { status: 400 });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const result = await client.query(
      `UPDATE church_action_follow_up
          SET status = $1::text,
              completed_at = CASE WHEN $1::text IN ('COMPLETED', 'NOT_APPLICABLE') THEN COALESCE(completed_at, now()) ELSE NULL END,
              completed_by_user_id = CASE WHEN $1::text IN ('COMPLETED', 'NOT_APPLICABLE') THEN COALESCE(completed_by_user_id, $2::uuid) ELSE NULL END,
              updated_at = now()
        WHERE id = $3::uuid AND ward_id = $4::uuid
      RETURNING id, family, action_type, status, member_name, calling_assignment_id,
                membership_ordinance_id, source_event, source_event_id, description,
                official_system, official_reference_url, due_date, completed_at,
                completed_by_user_id, created_at, updated_at`,
      [status, session.user.id, actionId, wardId]
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Action not found', code: 'NOT_FOUND' }, { status: 404 });
    }
    const action = result.rows[0] as { id: string; family: string; action_type: string; status: string; member_name: string; membership_ordinance_id: string | null };
    if (status === 'COMPLETED' && action.membership_ordinance_id) {
      await client.query(
        `UPDATE meeting_membership_ordinance
            SET lcr_follow_up_status = 'completed', lcr_updated_at = now(), updated_at = now()
          WHERE id = $1::uuid AND ward_id = $2::uuid AND status = 'completed' AND lcr_follow_up_status = 'needed'`,
        [action.membership_ordinance_id, wardId]
      );
    }
    await recordAuditEvent(client, {
      wardId,
      userId: session.user.id,
      actorName: session.user.name || session.user.email || null,
      actorRole: session.user.roles?.[0] || null,
      action: status === 'COMPLETED' ? 'CHURCH_ACTION_FOLLOW_UP_COMPLETED' : 'CHURCH_ACTION_FOLLOW_UP_STATUS_CHANGED',
      entityType: 'church_action_follow_up',
      entityId: action.id,
      changes: { status: { old: null, new: status } },
      details: { family: action.family, actionType: action.action_type, memberName: action.member_name },
      source: 'manual_ui',
      severity: 'notice'
    });
    await client.query('COMMIT');
    return NextResponse.json({ action: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('church_action_follow_up_update_failed', { wardId, actionId, error });
    return NextResponse.json({ error: 'Failed to update action', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
