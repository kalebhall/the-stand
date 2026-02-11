import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canViewMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

type CalendarEventRow = {
  id: string;
  calendar_feed_id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  tags: string[];
  copied_to_announcement_at: string | null;
  imported_at: string;
};

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

    const feeds = await client.query(
      `SELECT id, display_name, feed_scope, feed_url, is_active, last_refreshed_at, last_refresh_status, last_refresh_error
         FROM calendar_feed
        WHERE ward_id = $1
        ORDER BY created_at ASC`,
      [wardId]
    );

    const events = await client.query(
      `SELECT id, calendar_feed_id, title, description, location, starts_at, ends_at, all_day, tags, copied_to_announcement_at, imported_at
         FROM calendar_event_cache
        WHERE ward_id = $1
        ORDER BY starts_at DESC
        LIMIT 100`,
      [wardId]
    );

    await client.query('COMMIT');

    return NextResponse.json({
      feeds: feeds.rows,
      events: (events.rows as CalendarEventRow[]).map((row) => ({
        id: row.id,
        calendarFeedId: row.calendar_feed_id,
        title: row.title,
        description: row.description,
        location: row.location,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        allDay: row.all_day,
        tags: row.tags,
        copiedToAnnouncementAt: row.copied_to_announcement_at,
        importedAt: row.imported_at
      }))
    });
  } catch {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: 'Failed to list calendar events', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
