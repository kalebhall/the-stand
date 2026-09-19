import { NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/src/auth/auth';
import { hasRole } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { enqueueGlobalNotificationEvent, insertGlobalNotificationEvent } from '@/src/notifications/global-outbox';
import { enqueueGlobalNotificationJob } from '@/src/notifications/queue';

const workStatuses = ['UNASSIGNED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'] as const;
const patchSchema = z.object({
  id: z.string().uuid(),
  operation: z.enum(['CLAIM', 'ASSIGN', 'STATUS']),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  assignedToUserId: z.string().uuid().nullable().optional(),
  status: z.enum(workStatuses).optional()
});

type QueueRow = {
  id: string;
  source_type: string;
  source_id: string;
  status: (typeof workStatuses)[number];
  assigned_to_user_id: string | null;
  assigned_to_email: string | null;
  claimed_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

function canUseSupportQueue(roles: string[] | undefined): boolean {
  return hasRole(roles, 'SUPPORT_ADMIN') || hasRole(roles, 'SYSTEM_ADMIN');
}

async function hasActiveGlobalRole(userId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1
       FROM user_global_role ugr
       JOIN role r ON r.id = ugr.role_id
       JOIN user_account u ON u.id = ugr.user_id
      WHERE ugr.user_id = $1::uuid
        AND u.is_active = true
        AND r.name IN ('SUPPORT_ADMIN', 'SYSTEM_ADMIN')
      LIMIT 1`,
    [userId]
  );

  return Boolean(result.rowCount);
}

function unauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
}

function forbiddenResponse() {
  return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
}

type QueueAssignee = {
  id: string;
  email: string;
};

function serializeAssignee(row: QueueAssignee) {
  return { id: row.id, email: row.email };
}

function serialize(row: QueueRow) {
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    status: row.status,
    assignedToUserId: row.assigned_to_user_id,
    assignedToEmail: row.assigned_to_email,
    claimedAt: row.claimed_at,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return unauthorizedResponse();
  }

  if (!canUseSupportQueue(session.user.roles) || !(await hasActiveGlobalRole(session.user.id))) {
    return forbiddenResponse();
  }

  const result = await pool.query(
    `SELECT wi.id,
            wi.source_type,
            wi.source_id,
            wi.status,
            wi.assigned_to_user_id,
            assigned.email AS assigned_to_email,
            wi.claimed_at,
            wi.resolved_at,
            wi.created_at,
            wi.updated_at
       FROM support_work_item wi
       LEFT JOIN user_account assigned ON assigned.id = wi.assigned_to_user_id
      ORDER BY CASE WHEN wi.status IN ('RESOLVED', 'CLOSED') THEN 1 ELSE 0 END,
               wi.created_at ASC`
  );

  const assignees = await pool.query(
    `SELECT DISTINCT u.id, u.email
       FROM user_account u
       JOIN user_global_role ugr ON ugr.user_id = u.id
       JOIN role r ON r.id = ugr.role_id
      WHERE u.is_active = true
        AND r.name IN ('SUPPORT_ADMIN', 'SYSTEM_ADMIN')
      ORDER BY u.email`
  );

  return NextResponse.json({
    items: result.rows.map(serialize),
    assignees: assignees.rows.map((row) => serializeAssignee(row as QueueAssignee))
  });
}

export async function PATCH(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return unauthorizedResponse();
  }

  if (!canUseSupportQueue(session.user.roles) || !(await hasActiveGlobalRole(session.user.id))) {
    return forbiddenResponse();
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid queue update', code: 'BAD_REQUEST' }, { status: 400 });
  }

  const input = parsed.data;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let assignedToUserId: string | null = null;
    let nextStatus: (typeof workStatuses)[number];
    let auditAction: string;

    if (input.operation === 'CLAIM') {
      assignedToUserId = session.user.id;
      nextStatus = 'ASSIGNED';
      auditAction = 'SUPPORT_WORK_ITEM_CLAIMED';
    } else if (input.operation === 'ASSIGN') {
      if (!input.assignedToUserId) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Assignee is required', code: 'BAD_REQUEST' }, { status: 400 });
      }

      const assignee = await client.query(
        `SELECT u.id
           FROM user_account u
           JOIN user_global_role ugr ON ugr.user_id = u.id
           JOIN role r ON r.id = ugr.role_id
          WHERE u.id = $1::uuid
            AND u.is_active = true
            AND r.name IN ('SUPPORT_ADMIN', 'SYSTEM_ADMIN')
          LIMIT 1`,
        [input.assignedToUserId]
      );

      if (!assignee.rowCount) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Assignee is not an active global administrator', code: 'INVALID_ASSIGNEE' }, { status: 400 });
      }

      assignedToUserId = input.assignedToUserId;
      nextStatus = 'ASSIGNED';
      auditAction = 'SUPPORT_WORK_ITEM_ASSIGNED';
    } else {
      if (!input.status) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Status is required', code: 'BAD_REQUEST' }, { status: 400 });
      }

      nextStatus = input.status;
      auditAction = 'SUPPORT_WORK_ITEM_STATUS_CHANGED';
    }

    const updated = await client.query(
      `UPDATE support_work_item
          SET assigned_to_user_id = CASE WHEN $1::boolean THEN $2::uuid ELSE assigned_to_user_id END,
              status = $3::text,
              claimed_at = CASE WHEN $4::boolean THEN COALESCE(claimed_at, now()) ELSE claimed_at END,
              resolved_at = CASE WHEN $3::text IN ('RESOLVED', 'CLOSED') THEN COALESCE(resolved_at, now()) ELSE NULL END,
              updated_at = now()
        WHERE id = $5::uuid
          AND updated_at = $6::timestamptz
        RETURNING id, source_type, source_id, status, assigned_to_user_id,
                  NULL::text AS assigned_to_email, claimed_at, resolved_at, created_at, updated_at`,
      [input.operation !== 'STATUS' || input.assignedToUserId !== undefined, assignedToUserId, nextStatus, input.operation !== 'STATUS' || input.assignedToUserId !== undefined, input.id, input.expectedUpdatedAt]
    );

    if (!updated.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Queue item changed; reload and retry', code: 'CONFLICT' }, { status: 409 });
    }

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, entity_type, entity_id, details)
       VALUES (NULL, $1::uuid, $2::text, 'SUPPORT_WORK_ITEM', $3::text,
               jsonb_build_object('status', $4::text, 'assignedToUserId', $5::text))`,
      [session.user.id, auditAction, input.id, nextStatus, assignedToUserId]
    );

    const globalEventOutboxId = await insertGlobalNotificationEvent(client, {
      aggregateType: 'SUPPORT_WORK_ITEM',
      aggregateId: input.id,
      eventType: input.operation === 'STATUS' ? 'SUPPORT_REQUEST_STATUS_CHANGED' : 'SUPPORT_REQUEST_ASSIGNED',
      payload: { status: nextStatus, assignedToUserId }
    });

    await client.query('COMMIT');
    enqueueGlobalNotificationEvent(enqueueGlobalNotificationJob, globalEventOutboxId);
    return NextResponse.json({ item: serialize(updated.rows[0]) });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
