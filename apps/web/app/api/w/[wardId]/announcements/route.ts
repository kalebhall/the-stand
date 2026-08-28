import { NextResponse } from 'next/server';

import { isAnnouncementPlacement } from '@/src/announcements/types';
import { recordAuditEvent } from '@/src/audit/service';
import { auth } from '@/src/auth/auth';
import { canManageMeetings, canViewMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { createLogger } from '@/src/lib/logger';
import { setDbContext } from '@/src/db/context';
import { enqueueOutboxNotificationJob } from '@/src/notifications/queue';
import { enqueueNotificationOutboxEvent, insertNotificationOutboxEvent } from '@/src/notifications/outbox';

const logger = createLogger('announcements');

type AnnouncementRow = {
  id: string;
  title: string;
  body: string | null;
  start_date: string | null;
  end_date: string | null;
  is_permanent: boolean;
  placement: string;
  include_in_program: boolean;
  include_in_stand: boolean;
  created_at: string;
};

type AnnouncementPayload = {
  title?: string;
  body?: string;
  startDate?: string | null;
  endDate?: string | null;
  isPermanent?: boolean;
  placement?: string;
  includeInProgram?: boolean;
  includeInStand?: boolean;
};

function normalizeDate(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length ? trimmed : null;
}

export async function GET(_: Request, context: { params: Promise<{ wardId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId } = await context.params;
  if (!canViewMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const result = await client.query(
      `SELECT id, title, body, start_date, end_date, is_permanent, placement, include_in_program, include_in_stand, created_at
         FROM announcement
        WHERE ward_id = $1
        ORDER BY created_at DESC`,
      [wardId]
    );

    await client.query('COMMIT');

    return NextResponse.json({
      announcements: (result.rows as AnnouncementRow[]).map((row) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        startDate: row.start_date,
        endDate: row.end_date,
        isPermanent: row.is_permanent,
        placement: row.placement,
        includeInProgram: row.include_in_program,
        includeInStand: row.include_in_stand,
        createdAt: row.created_at
      }))
    });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to list announcements', { wardId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Failed to list announcements', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function POST(request: Request, context: { params: Promise<{ wardId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId } = await context.params;
  if (!canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as AnnouncementPayload | null;
  const title = body?.title?.trim() ?? '';
  const placement = body?.placement?.trim() ?? 'PROGRAM_TOP';
  const startDate = normalizeDate(body?.startDate);
  const endDate = normalizeDate(body?.endDate);
  const isPermanent = Boolean(body?.isPermanent);
  const includeInProgram = body?.includeInProgram !== false;
  const includeInStand = Boolean(body?.includeInStand);
  const details = body?.body?.trim() ?? '';

  if (!title || !isAnnouncementPlacement(placement) || (startDate && endDate && startDate > endDate)) {
    return NextResponse.json({ error: 'Invalid announcement payload', code: 'BAD_REQUEST' }, { status: 400 });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const inserted = await client.query(
      `INSERT INTO announcement (ward_id, title, body, start_date, end_date, is_permanent, placement, include_in_program, include_in_stand)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [wardId, title, details || null, startDate, endDate, isPermanent, placement, includeInProgram, includeInStand]
    );

    await recordAuditEvent(client, {
      wardId,
      userId: session.user.id,
      actorName: session.user.name || session.user.email || null,
      action: 'ANNOUNCEMENT_CREATED',
      entityType: 'announcement',
      entityId: inserted.rows[0].id,
      changes: {
        title: { old: null, new: title },
        placement: { old: null, new: placement },
        startDate: { old: null, new: startDate },
        endDate: { old: null, new: endDate },
        isPermanent: { old: null, new: isPermanent },
        includeInProgram: { old: null, new: includeInProgram },
        includeInStand: { old: null, new: includeInStand }
      },
      details: {
        announcementId: inserted.rows[0].id,
        title,
        placement,
        isPermanent,
        includeInProgram,
        includeInStand
      },
      source: 'manual_ui',
      severity: 'info'
    });

    const eventOutboxId = await insertNotificationOutboxEvent(client, {
      wardId,
      aggregateType: 'announcement',
      aggregateId: inserted.rows[0].id,
      eventType: 'ANNOUNCEMENT_CREATED',
      payload: { announcementId: inserted.rows[0].id }
    });

    await client.query('COMMIT');

    enqueueNotificationOutboxEvent(enqueueOutboxNotificationJob, wardId, eventOutboxId);

    return NextResponse.json({ id: inserted.rows[0].id }, { status: 201 });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to create announcement', { wardId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Failed to create announcement', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
