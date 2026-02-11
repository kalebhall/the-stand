import { NextResponse } from 'next/server';

import { isAnnouncementPlacement } from '@/src/announcements/types';
import { auth } from '@/src/auth/auth';
import { canManageMeetings, canViewMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

type AnnouncementRow = {
  id: string;
  title: string;
  body: string | null;
  start_date: string | null;
  end_date: string | null;
  is_permanent: boolean;
  placement: string;
  created_at: string;
};

type AnnouncementPayload = {
  title?: string;
  body?: string;
  startDate?: string | null;
  endDate?: string | null;
  isPermanent?: boolean;
  placement?: string;
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
      `SELECT id, title, body, start_date, end_date, is_permanent, placement, created_at
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
        createdAt: row.created_at
      }))
    });
  } catch {
    await client.query('ROLLBACK');
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
  const details = body?.body?.trim() ?? '';

  if (!title || !isAnnouncementPlacement(placement) || (startDate && endDate && startDate > endDate)) {
    return NextResponse.json({ error: 'Invalid announcement payload', code: 'BAD_REQUEST' }, { status: 400 });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const inserted = await client.query(
      `INSERT INTO announcement (ward_id, title, body, start_date, end_date, is_permanent, placement)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [wardId, title, details || null, startDate, endDate, isPermanent, placement]
    );

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES ($1, $2, 'ANNOUNCEMENT_CREATED', jsonb_build_object('announcementId', $3, 'title', $4, 'placement', $5, 'isPermanent', $6))`,
      [wardId, session.user.id, inserted.rows[0].id, title, placement, isPermanent]
    );

    await client.query('COMMIT');

    return NextResponse.json({ id: inserted.rows[0].id }, { status: 201 });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to create announcement', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
