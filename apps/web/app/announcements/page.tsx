import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { AnnouncementsWorkspaceClient } from './announcements-workspace-client';
import { copyCalendarEventToAnnouncement, refreshCalendarFeedsForWard } from '@/src/calendar/service';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canManageMeetings, canViewMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { getNextSunday, toYyyyMmDd } from '@/src/meetings/date';

type AnnouncementRow = {
  id: string;
  title: string;
  body: string | null;
  start_date: string | null;
  end_date: string | null;
  is_permanent: boolean;
  placement: 'PROGRAM_TOP' | 'PROGRAM_BOTTOM';
  include_in_program: boolean;
  include_in_stand: boolean;
  created_at: string;
};

type CalendarFeedRow = {
  id: string;
  display_name: string;
  feed_scope: 'WARD' | 'STAKE' | 'CHURCH';
  last_refreshed_at: string | null;
  last_refresh_status: string | null;
  last_refresh_error: string | null;
};

type CalendarEventRow = {
  id: string;
  calendar_feed_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  tags: string[];
  copied_to_announcement_at: string | null;
};

export default async function AnnouncementsPage({ searchParams }: { searchParams: Promise<{ sunday?: string }> }) {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);

  if (!session.activeWardId || !canViewMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) {
    redirect('/dashboard');
  }

  const canManage = canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId);

  const queryParams = await searchParams;
  const targetSunday = queryParams.sunday && /^\d{4}-\d{2}-\d{2}$/.test(queryParams.sunday) ? queryParams.sunday : getNextSunday();

  // Server action: Create Announcement manually
  async function createAnnouncement(formData: FormData) {
    'use server';

    const actionSession = await requireAuthenticatedSession();
    enforcePasswordRotation(actionSession);

    if (
      !actionSession.activeWardId ||
      !canManageMeetings({ roles: actionSession.user.roles, activeWardId: actionSession.activeWardId }, actionSession.activeWardId)
    ) {
      redirect('/announcements');
    }

    const title = String(formData.get('title') ?? '').trim();
    const body = String(formData.get('body') ?? '').trim();
    const startDateInput = String(formData.get('startDate') ?? '').trim();
    const endDateInput = String(formData.get('endDate') ?? '').trim();
    const placement = String(formData.get('placement') ?? 'PROGRAM_TOP').trim();
    const isPermanent = formData.get('isPermanent') === 'on';
    const includeInProgram = formData.get('includeInProgram') !== 'off' && formData.get('includeInProgram') !== 'false';
    const includeInStand = formData.get('includeInStand') === 'on' || formData.get('includeInStand') === 'true';

    const startDate = startDateInput.length ? startDateInput : null;
    const endDate = endDateInput.length ? endDateInput : null;

    if (!title || (startDate && endDate && startDate > endDate)) {
      redirect(`/announcements?sunday=${targetSunday}`);
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await setDbContext(client, { userId: actionSession.user.id, wardId: actionSession.activeWardId });

      const inserted = await client.query(
        `INSERT INTO announcement (ward_id, title, body, start_date, end_date, is_permanent, placement, include_in_program, include_in_stand)
         VALUES ($1::uuid, $2::text, $3::text, $4::date, $5::date, $6::boolean, $7::text, $8::boolean, $9::boolean)
         RETURNING id`,
        [actionSession.activeWardId, title, body || null, startDate, endDate, isPermanent, placement, includeInProgram, includeInStand]
      );

      await client.query(
        `INSERT INTO audit_log (ward_id, user_id, action, details)
         VALUES ($1::uuid, $2::uuid, 'ANNOUNCEMENT_CREATED', jsonb_build_object('announcementId', $3::text, 'title', $4::text, 'placement', $5::text, 'isPermanent', $6::boolean, 'includeInProgram', $7::boolean, 'includeInStand', $8::boolean))`,
        [
          actionSession.activeWardId,
          actionSession.user.id,
          inserted.rows[0].id,
          title,
          placement,
          isPermanent,
          includeInProgram,
          includeInStand
        ]
      );

      await client.query('COMMIT');
    } catch {
      await client.query('ROLLBACK');
      throw new Error('Failed to create announcement');
    } finally {
      client.release();
    }

    revalidatePath('/announcements');
  }

  // Server action: Update Announcement
  async function updateAnnouncement(formData: FormData) {
    'use server';

    const actionSession = await requireAuthenticatedSession();
    enforcePasswordRotation(actionSession);

    if (
      !actionSession.activeWardId ||
      !canManageMeetings({ roles: actionSession.user.roles, activeWardId: actionSession.activeWardId }, actionSession.activeWardId)
    ) {
      redirect('/announcements');
    }

    const announcementId = String(formData.get('announcementId') ?? '').trim();
    const title = String(formData.get('title') ?? '').trim();
    const body = String(formData.get('body') ?? '').trim();
    const startDateInput = String(formData.get('startDate') ?? '').trim();
    const endDateInput = String(formData.get('endDate') ?? '').trim();
    const placement = String(formData.get('placement') ?? 'PROGRAM_TOP').trim();
    const isPermanent = formData.get('isPermanent') === 'on';
    const includeInProgram = formData.get('includeInProgram') !== 'off' && formData.get('includeInProgram') !== 'false';
    const includeInStand = formData.get('includeInStand') === 'on' || formData.get('includeInStand') === 'true';

    const startDate = startDateInput.length ? startDateInput : null;
    const endDate = endDateInput.length ? endDateInput : null;

    if (!announcementId || !title || (startDate && endDate && startDate > endDate)) {
      redirect(`/announcements?sunday=${targetSunday}`);
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await setDbContext(client, { userId: actionSession.user.id, wardId: actionSession.activeWardId });

      await client.query(
        `UPDATE announcement
            SET title = $1::text,
                body = $2::text,
                start_date = $3::date,
                end_date = $4::date,
                is_permanent = $5::boolean,
                placement = $6::text,
                include_in_program = $7::boolean,
                include_in_stand = $8::boolean
          WHERE id = $9::uuid AND ward_id = $10::uuid`,
        [
          title,
          body || null,
          startDate,
          endDate,
          isPermanent,
          placement,
          includeInProgram,
          includeInStand,
          announcementId,
          actionSession.activeWardId
        ]
      );

      await client.query(
        `INSERT INTO audit_log (ward_id, user_id, action, details)
         VALUES ($1::uuid, $2::uuid, 'ANNOUNCEMENT_UPDATED', jsonb_build_object('announcementId', $3::text, 'title', $4::text, 'placement', $5::text, 'isPermanent', $6::boolean, 'includeInProgram', $7::boolean, 'includeInStand', $8::boolean))`,
        [actionSession.activeWardId, actionSession.user.id, announcementId, title, placement, isPermanent, includeInProgram, includeInStand]
      );

      await client.query('COMMIT');
    } catch {
      await client.query('ROLLBACK');
      throw new Error('Failed to update announcement');
    } finally {
      client.release();
    }

    revalidatePath('/announcements');
  }

  // Server action: Delete Announcement
  async function deleteAnnouncement(formData: FormData) {
    'use server';

    const actionSession = await requireAuthenticatedSession();
    enforcePasswordRotation(actionSession);

    if (
      !actionSession.activeWardId ||
      !canManageMeetings({ roles: actionSession.user.roles, activeWardId: actionSession.activeWardId }, actionSession.activeWardId)
    ) {
      redirect('/announcements');
    }

    const announcementId = String(formData.get('announcementId') ?? '').trim();
    if (!announcementId) {
      redirect(`/announcements?sunday=${targetSunday}`);
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await setDbContext(client, { userId: actionSession.user.id, wardId: actionSession.activeWardId });

      const deleted = await client.query('DELETE FROM announcement WHERE id = $1::uuid AND ward_id = $2::uuid RETURNING id, title', [
        announcementId,
        actionSession.activeWardId
      ]);

      if (deleted.rowCount) {
        await client.query(
          `INSERT INTO audit_log (ward_id, user_id, action, details)
           VALUES ($1::uuid, $2::uuid, 'ANNOUNCEMENT_DELETED', jsonb_build_object('announcementId', $3::text, 'title', $4::text))`,
          [actionSession.activeWardId, actionSession.user.id, announcementId, deleted.rows[0].title]
        );
      }

      await client.query('COMMIT');
    } catch {
      await client.query('ROLLBACK');
      throw new Error('Failed to delete announcement');
    } finally {
      client.release();
    }

    revalidatePath('/announcements');
  }

  // Server action: Copy calendar event to announcement
  async function copyCalendarEvent(formData: FormData) {
    'use server';

    const actionSession = await requireAuthenticatedSession();
    enforcePasswordRotation(actionSession);

    if (
      !actionSession.activeWardId ||
      !canManageMeetings({ roles: actionSession.user.roles, activeWardId: actionSession.activeWardId }, actionSession.activeWardId)
    ) {
      redirect('/announcements');
    }

    const calendarEventCacheId = String(formData.get('calendarEventCacheId') ?? '').trim();
    if (!calendarEventCacheId) {
      redirect(`/announcements?sunday=${targetSunday}`);
    }

    try {
      await copyCalendarEventToAnnouncement({
        wardId: actionSession.activeWardId,
        userId: actionSession.user.id,
        calendarEventCacheId
      });
    } catch (error) {
      console.error('[Action copyCalendarEvent Error]', error);
      throw new Error('Failed to copy calendar event to announcement');
    }

    revalidatePath('/announcements');
  }

  // Server action: Refresh calendar feeds
  async function refreshCalendar() {
    'use server';

    const actionSession = await requireAuthenticatedSession();
    enforcePasswordRotation(actionSession);

    if (
      !actionSession.activeWardId ||
      !canManageMeetings({ roles: actionSession.user.roles, activeWardId: actionSession.activeWardId }, actionSession.activeWardId)
    ) {
      redirect('/announcements');
    }

    try {
      await refreshCalendarFeedsForWard({ wardId: actionSession.activeWardId, userId: actionSession.user.id, reason: 'manual' });
    } catch (error) {
      console.error('[Action refreshCalendar Error]', error);
      throw new Error('Failed to refresh calendar feeds');
    }
    revalidatePath('/announcements');
  }

  // Server action: Create calendar feed
  async function createCalendarFeed(formData: FormData) {
    'use server';

    const actionSession = await requireAuthenticatedSession();
    enforcePasswordRotation(actionSession);

    if (
      !actionSession.activeWardId ||
      !canManageMeetings({ roles: actionSession.user.roles, activeWardId: actionSession.activeWardId }, actionSession.activeWardId)
    ) {
      redirect('/announcements');
    }

    const displayName = String(formData.get('displayName') ?? '').trim();
    const feedUrl = String(formData.get('feedUrl') ?? '').trim();
    const feedScope = String(formData.get('feedScope') ?? 'WARD').trim();

    if (!displayName || !feedUrl || !['WARD', 'STAKE', 'CHURCH'].includes(feedScope)) {
      redirect(`/announcements?sunday=${targetSunday}`);
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await setDbContext(client, { userId: actionSession.user.id, wardId: actionSession.activeWardId });

      const updateResult = await client.query(
        `UPDATE calendar_feed
            SET display_name = $3::text,
                feed_scope = $4::text,
                is_active = TRUE,
                last_refresh_status = NULL,
                last_refresh_error = NULL,
                last_refreshed_at = NULL
          WHERE ward_id = $1::uuid AND feed_url = $2::text`,
        [actionSession.activeWardId, feedUrl, displayName, feedScope]
      );

      let isInsert = false;

      if (updateResult.rowCount === 0) {
        try {
          await client.query(
            `INSERT INTO calendar_feed (ward_id, display_name, feed_url, feed_scope)
             VALUES ($1::uuid, $2::text, $3::text, $4::text)`,
            [actionSession.activeWardId, displayName, feedUrl, feedScope]
          );

          isInsert = true;
        } catch (error) {
          const isUniqueViolation =
            typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505';

          if (!isUniqueViolation) {
            throw error;
          }

          await client.query(
            `UPDATE calendar_feed
                SET display_name = $3::text,
                    feed_scope = $4::text,
                    is_active = TRUE,
                    last_refresh_status = NULL,
                    last_refresh_error = NULL,
                    last_refreshed_at = NULL
              WHERE ward_id = $1::uuid AND feed_url = $2::text`,
            [actionSession.activeWardId, feedUrl, displayName, feedScope]
          );
        }
      }

      await client.query(
        `INSERT INTO audit_log (ward_id, user_id, action, details)
         VALUES ($1::uuid, $2::uuid, $3::text, $4::jsonb)`,
        [
          actionSession.activeWardId,
          actionSession.user.id,
          isInsert ? 'CALENDAR_FEED_CREATED' : 'CALENDAR_FEED_UPDATED',
          JSON.stringify({ displayName, feedScope, feedUrl })
        ]
      );

      await client.query('COMMIT');
    } catch {
      await client.query('ROLLBACK');
      throw new Error('Failed to create calendar feed');
    } finally {
      client.release();
    }

    revalidatePath('/announcements');
  }

  // Server action: Delete calendar feed
  async function deleteCalendarFeed(formData: FormData) {
    'use server';

    const actionSession = await requireAuthenticatedSession();
    enforcePasswordRotation(actionSession);

    if (
      !actionSession.activeWardId ||
      !canManageMeetings({ roles: actionSession.user.roles, activeWardId: actionSession.activeWardId }, actionSession.activeWardId)
    ) {
      redirect('/announcements');
    }

    const feedId = String(formData.get('feedId') ?? '').trim();
    if (!feedId) {
      redirect(`/announcements?sunday=${targetSunday}`);
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await setDbContext(client, { userId: actionSession.user.id, wardId: actionSession.activeWardId });

      const deleted = await client.query('DELETE FROM calendar_feed WHERE id = $1::uuid AND ward_id = $2::uuid RETURNING display_name', [
        feedId,
        actionSession.activeWardId
      ]);

      if (deleted.rowCount) {
        await client.query(
          `INSERT INTO audit_log (ward_id, user_id, action, details)
           VALUES ($1::uuid, $2::uuid, 'CALENDAR_FEED_DELETED', jsonb_build_object('feedId', $3::text, 'displayName', $4::text))`,
          [actionSession.activeWardId, actionSession.user.id, feedId, deleted.rows[0].display_name]
        );
      }

      await client.query('COMMIT');
    } catch {
      await client.query('ROLLBACK');
      throw new Error('Failed to delete calendar feed');
    } finally {
      client.release();
    }

    revalidatePath('/announcements');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId: session.activeWardId });

    const announcementResult = await client.query(
      `SELECT id, title, body, start_date, end_date, is_permanent, placement, include_in_program, include_in_stand, created_at
         FROM announcement
        WHERE ward_id = $1::uuid
        ORDER BY created_at DESC`,
      [session.activeWardId]
    );

    const calendarFeedsResult = await client.query(
      `SELECT id, display_name, feed_scope, last_refreshed_at, last_refresh_status, last_refresh_error
         FROM calendar_feed
        WHERE ward_id = $1::uuid
        ORDER BY created_at ASC`,
      [session.activeWardId]
    );

    const calendarEventsResult = await client.query(
      `SELECT id, calendar_feed_id, title, description, starts_at, ends_at, tags, copied_to_announcement_at
         FROM calendar_event_cache
        WHERE ward_id = $1::uuid
          AND starts_at >= now()
        ORDER BY starts_at ASC
        LIMIT 100`,
      [session.activeWardId]
    );

    await client.query('COMMIT');

    const announcements = (announcementResult.rows as AnnouncementRow[]).map((r) => ({
      ...r,
      start_date: toYyyyMmDd(r.start_date) || null,
      end_date: toYyyyMmDd(r.end_date) || null
    }));
    const calendarFeeds = calendarFeedsResult.rows as CalendarFeedRow[];
    const calendarEvents = calendarEventsResult.rows as CalendarEventRow[];

    return (
      <AnnouncementsWorkspaceClient
        wardId={session.activeWardId}
        targetSunday={targetSunday}
        canManage={canManage}
        announcements={announcements}
        calendarFeeds={calendarFeeds}
        calendarEvents={calendarEvents}
        actions={{
          createAnnouncement,
          updateAnnouncement,
          deleteAnnouncement,
          copyCalendarEvent,
          refreshCalendar,
          createCalendarFeed,
          deleteCalendarFeed
        }}
      />
    );
  } catch {
    await client.query('ROLLBACK');
    throw new Error('Failed to load announcements');
  } finally {
    client.release();
  }
}
