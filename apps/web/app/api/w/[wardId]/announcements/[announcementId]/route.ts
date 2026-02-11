import { NextResponse } from 'next/server';

import { isAnnouncementPlacement } from '@/src/announcements/types';
import { auth } from '@/src/auth/auth';
import { canManageMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

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

export async function PUT(request: Request, context: { params: Promise<{ wardId: string; announcementId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId, announcementId } = await context.params;
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

    const updated = await client.query(
      `UPDATE announcement
          SET title = $1,
              body = $2,
              start_date = $3,
              end_date = $4,
              is_permanent = $5,
              placement = $6
        WHERE id = $7 AND ward_id = $8
        RETURNING id`,
      [title, details || null, startDate, endDate, isPermanent, placement, announcementId, wardId]
    );

    if (!updated.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Announcement not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES ($1, $2, 'ANNOUNCEMENT_UPDATED', jsonb_build_object('announcementId', $3, 'title', $4, 'placement', $5, 'isPermanent', $6))`,
      [wardId, session.user.id, announcementId, title, placement, isPermanent]
    );

    await client.query('COMMIT');

    return NextResponse.json({ success: true });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to update announcement', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ wardId: string; announcementId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId, announcementId } = await context.params;
  if (!canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const deleted = await client.query('DELETE FROM announcement WHERE id = $1 AND ward_id = $2 RETURNING id, title', [announcementId, wardId]);

    if (!deleted.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Announcement not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES ($1, $2, 'ANNOUNCEMENT_DELETED', jsonb_build_object('announcementId', $3, 'title', $4))`,
      [wardId, session.user.id, announcementId, deleted.rows[0].title]
    );

    await client.query('COMMIT');

    return new NextResponse(null, { status: 204 });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to delete announcement', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
