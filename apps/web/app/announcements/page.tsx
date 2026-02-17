import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { copyCalendarEventToAnnouncement, refreshCalendarFeedsForWard } from '@/src/calendar/service';
import { isAnnouncementActiveForDate, isAnnouncementPlacement } from '@/src/announcements/types';
import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
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
  placement: 'PROGRAM_TOP' | 'PROGRAM_BOTTOM';
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
  tags: string[];
  copied_to_announcement_at: string | null;
};

function formatWindow(startDate: string | null, endDate: string | null, isPermanent: boolean): string {
  if (isPermanent) {
    return 'Permanent';
  }

  if (startDate && endDate) {
    return `${startDate} → ${endDate}`;
  }

  if (startDate) {
    return `Starts ${startDate}`;
  }

  if (endDate) {
    return `Ends ${endDate}`;
  }

  return 'No date window';
}

export default async function AnnouncementsPage() {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);

  if (!session.activeWardId || !canViewMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) {
    redirect('/dashboard');
  }

  const canManage = canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId);

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

    const startDate = startDateInput.length ? startDateInput : null;
    const endDate = endDateInput.length ? endDateInput : null;

    if (!title || !isAnnouncementPlacement(placement) || (startDate && endDate && startDate > endDate)) {
      redirect('/announcements');
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await setDbContext(client, { userId: actionSession.user.id, wardId: actionSession.activeWardId });

      const inserted = await client.query(
        `INSERT INTO announcement (ward_id, title, body, start_date, end_date, is_permanent, placement)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [actionSession.activeWardId, title, body || null, startDate, endDate, isPermanent, placement]
      );

      await client.query(
        `INSERT INTO audit_log (ward_id, user_id, action, details)
         VALUES ($1, $2, 'ANNOUNCEMENT_CREATED', jsonb_build_object('announcementId', $3, 'title', $4, 'placement', $5, 'isPermanent', $6))`,
        [actionSession.activeWardId, actionSession.user.id, inserted.rows[0].id, title, placement, isPermanent]
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
      redirect('/announcements');
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await setDbContext(client, { userId: actionSession.user.id, wardId: actionSession.activeWardId });

      const deleted = await client.query('DELETE FROM announcement WHERE id = $1 AND ward_id = $2 RETURNING id, title', [
        announcementId,
        actionSession.activeWardId
      ]);

      if (deleted.rowCount) {
        await client.query(
          `INSERT INTO audit_log (ward_id, user_id, action, details)
           VALUES ($1, $2, 'ANNOUNCEMENT_DELETED', jsonb_build_object('announcementId', $3, 'title', $4))`,
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

    await refreshCalendarFeedsForWard({ wardId: actionSession.activeWardId, userId: actionSession.user.id, reason: 'manual' });
    revalidatePath('/announcements');
  }

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

    const startDate = startDateInput.length ? startDateInput : null;
    const endDate = endDateInput.length ? endDateInput : null;

    if (!announcementId || !title || !isAnnouncementPlacement(placement) || (startDate && endDate && startDate > endDate)) {
      redirect('/announcements');
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await setDbContext(client, { userId: actionSession.user.id, wardId: actionSession.activeWardId });

      await client.query(
        `UPDATE announcement
            SET title = $1, body = $2, start_date = $3, end_date = $4, is_permanent = $5, placement = $6
          WHERE id = $7 AND ward_id = $8`,
        [title, body || null, startDate, endDate, isPermanent, placement, announcementId, actionSession.activeWardId]
      );

      await client.query(
        `INSERT INTO audit_log (ward_id, user_id, action, details)
         VALUES ($1, $2, 'ANNOUNCEMENT_UPDATED', jsonb_build_object('announcementId', $3, 'title', $4, 'placement', $5, 'isPermanent', $6))`,
        [actionSession.activeWardId, actionSession.user.id, announcementId, title, placement, isPermanent]
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
      redirect('/announcements');
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
         VALUES ($1, $2, $3, $4::jsonb)`,
        [
          actionSession.activeWardId,
          actionSession.user.id,
          isInsert ? 'CALENDAR_FEED_CREATED' : 'CALENDAR_FEED_UPDATED',
          JSON.stringify({ displayName, feedScope, feedUrl })
        ]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');

      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode =
        typeof error === 'object' && error !== null && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
          ? (error as { code: string }).code
          : null;

      try {
        await client.query('BEGIN');
        await setDbContext(client, { userId: actionSession.user.id, wardId: actionSession.activeWardId });
        await client.query(
          `INSERT INTO audit_log (ward_id, user_id, action, details)
           VALUES ($1, $2, 'CALENDAR_FEED_CREATE_FAILED', $3::jsonb)`,
          [
            actionSession.activeWardId,
            actionSession.user.id,
            JSON.stringify({ displayName, feedScope, feedUrl, errorMessage, errorCode })
          ]
        );
        await client.query('COMMIT');
      } catch {
        await client.query('ROLLBACK');
      }

      throw new Error('Failed to create calendar feed', { cause: error });
    } finally {
      client.release();
    }

    revalidatePath('/announcements');
  }

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
      redirect('/announcements');
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await setDbContext(client, { userId: actionSession.user.id, wardId: actionSession.activeWardId });

      const deleted = await client.query(
        'DELETE FROM calendar_feed WHERE id = $1 AND ward_id = $2 RETURNING display_name',
        [feedId, actionSession.activeWardId]
      );

      if (deleted.rowCount) {
        await client.query(
          `INSERT INTO audit_log (ward_id, user_id, action, details)
           VALUES ($1, $2, 'CALENDAR_FEED_DELETED', jsonb_build_object('feedId', $3, 'displayName', $4))`,
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
      redirect('/announcements');
    }

    await copyCalendarEventToAnnouncement({
      wardId: actionSession.activeWardId,
      userId: actionSession.user.id,
      calendarEventCacheId
    });

    revalidatePath('/announcements');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId: session.activeWardId });

    const announcementResult = await client.query(
      `SELECT id, title, body, start_date, end_date, is_permanent, placement, created_at
         FROM announcement
        WHERE ward_id = $1
        ORDER BY created_at DESC`,
      [session.activeWardId]
    );

    const calendarFeedsResult = await client.query(
      `SELECT id, display_name, feed_scope, last_refreshed_at, last_refresh_status, last_refresh_error
         FROM calendar_feed
        WHERE ward_id = $1
        ORDER BY created_at ASC`,
      [session.activeWardId]
    );

    const calendarEventsResult = await client.query(
      `SELECT id, calendar_feed_id, title, description, starts_at, tags, copied_to_announcement_at
         FROM calendar_event_cache
        WHERE ward_id = $1
        ORDER BY starts_at DESC
        LIMIT 50`,
      [session.activeWardId]
    );

    await client.query('COMMIT');

    const today = new Date().toISOString().slice(0, 10);
    const announcements = announcementResult.rows as AnnouncementRow[];
    const calendarFeeds = calendarFeedsResult.rows as CalendarFeedRow[];
    const calendarEvents = calendarEventsResult.rows as CalendarEventRow[];
    const active = announcements.filter((item) => isAnnouncementActiveForDate({
      startDate: item.start_date,
      endDate: item.end_date,
      isPermanent: item.is_permanent
    }, today));
    const upcoming = announcements.filter((item) => !item.is_permanent && !!item.start_date && item.start_date > today);
    const expired = announcements.filter((item) => !item.is_permanent && !!item.end_date && item.end_date < today);

    return (
      <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
        <section className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Announcements</h1>
          <p className="text-sm text-muted-foreground">Manage date-window and permanent announcements used in meeting render output.</p>
        </section>

        {canManage ? (
          <section className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Calendar refresh</h2>
                <p className="text-sm text-muted-foreground">Refresh ward, stake, and church ICS feeds, then copy entries into announcements.</p>
              </div>
              <form action={refreshCalendar}>
                <Button type="submit" variant="outline">Refresh calendar feeds</Button>
              </form>
            </div>
            <ul className="mt-4 space-y-2 text-sm">
              {calendarFeeds.length ? (
                calendarFeeds.map((feed) => (
                  <li key={feed.id} className="rounded-md border p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">{feed.display_name} <span className="text-xs text-muted-foreground">({feed.feed_scope})</span></p>
                        <p className="text-xs text-muted-foreground">
                          Last refresh: {feed.last_refreshed_at ?? 'Never'} · Status: {feed.last_refresh_status ?? 'Not run'}
                        </p>
                        {feed.last_refresh_error ? <p className="text-xs text-destructive">{feed.last_refresh_error}</p> : null}
                      </div>
                      <form action={deleteCalendarFeed}>
                        <input type="hidden" name="feedId" value={feed.id} />
                        <Button type="submit" variant="outline" size="sm">Remove</Button>
                      </form>
                    </div>
                  </li>
                ))
              ) : (
                <li className="text-muted-foreground">No calendar feeds configured.</li>
              )}
            </ul>
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground">Add calendar feed</summary>
              <form action={createCalendarFeed} className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1 text-sm font-medium">
                  Display name
                  <input name="displayName" required className="rounded-md border bg-background px-3 py-2 text-sm" />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Feed URL (ICS)
                  <input name="feedUrl" required type="url" className="rounded-md border bg-background px-3 py-2 text-sm" />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Scope
                  <select name="feedScope" defaultValue="WARD" className="rounded-md border bg-background px-3 py-2 text-sm">
                    <option value="WARD">Ward</option>
                    <option value="STAKE">Stake</option>
                    <option value="CHURCH">Church</option>
                  </select>
                </label>
                <div className="sm:col-span-3">
                  <Button type="submit" size="sm">Add feed</Button>
                </div>
              </form>
            </details>
          </section>
        ) : null}

        {canManage ? (
          <section className="rounded-lg border bg-card p-4">
            <h2 className="text-lg font-semibold">Calendar cache</h2>
            <p className="text-sm text-muted-foreground">Copy imported calendar entries into announcement records using feed tag maps.</p>
            <ul className="mt-4 space-y-2">
              {calendarEvents.length ? (
                calendarEvents.map((event) => (
                  <li key={event.id} className="rounded-md border p-3 text-sm">
                    <p className="font-medium">{event.title}</p>
                    <p className="text-xs text-muted-foreground">{event.starts_at}</p>
                    {event.description ? <p className="mt-1 text-muted-foreground">{event.description}</p> : null}
                    {event.tags.length ? <p className="mt-1 text-xs text-muted-foreground">Tags: {event.tags.join(', ')}</p> : null}
                    <div className="mt-2">
                      <form action={copyCalendarEvent}>
                        <input type="hidden" name="calendarEventCacheId" value={event.id} />
                        <Button type="submit" size="sm" variant="secondary">Copy to announcement</Button>
                      </form>
                    </div>
                    {event.copied_to_announcement_at ? (
                      <p className="mt-1 text-xs text-muted-foreground">Last copied: {event.copied_to_announcement_at}</p>
                    ) : null}
                  </li>
                ))
              ) : (
                <li className="text-sm text-muted-foreground">No cached calendar events yet.</li>
              )}
            </ul>
          </section>
        ) : null}

        {canManage ? (
          <section className="rounded-lg border bg-card p-4">
            <h2 className="text-lg font-semibold">New announcement</h2>
            <form action={createAnnouncement} className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium sm:col-span-2">
                Title
                <input name="title" required className="rounded-md border bg-background px-3 py-2 text-sm" />
              </label>
              <label className="grid gap-1 text-sm font-medium sm:col-span-2">
                Body
                <textarea name="body" rows={3} className="rounded-md border bg-background px-3 py-2 text-sm" />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Start date
                <input name="startDate" type="date" className="rounded-md border bg-background px-3 py-2 text-sm" />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                End date
                <input name="endDate" type="date" className="rounded-md border bg-background px-3 py-2 text-sm" />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Placement
                <select name="placement" defaultValue="PROGRAM_TOP" className="rounded-md border bg-background px-3 py-2 text-sm">
                  <option value="PROGRAM_TOP">Program top</option>
                  <option value="PROGRAM_BOTTOM">Program bottom</option>
                </select>
              </label>
              <label className="mt-7 inline-flex items-center gap-2 text-sm font-medium">
                <input name="isPermanent" type="checkbox" className="h-4 w-4 rounded border" />
                Permanent announcement
              </label>
              <div className="sm:col-span-2">
                <Button type="submit">Create announcement</Button>
              </div>
            </form>
          </section>
        ) : null}

        {[
          { title: 'Active', items: active },
          { title: 'Upcoming', items: upcoming },
          { title: 'Expired', items: expired }
        ].map((group) => (
          <section key={group.title} className="rounded-lg border bg-card p-4">
            <h2 className="text-lg font-semibold">{group.title}</h2>
            {group.items.length ? (
              <ul className="mt-3 space-y-2">
                {group.items.map((item) => (
                  <li key={item.id} className="rounded-md border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">{item.title}</p>
                      <span className="rounded-full border px-2 py-0.5 text-xs font-medium">{item.placement === 'PROGRAM_TOP' ? 'Program top' : 'Program bottom'}</span>
                    </div>
                    {item.body ? <p className="mt-1 text-muted-foreground">{item.body}</p> : null}
                    <p className="mt-2 text-xs text-muted-foreground">{formatWindow(item.start_date, item.end_date, item.is_permanent)}</p>
                    {canManage ? (
                      <div className="mt-2 flex gap-2">
                        <form action={deleteAnnouncement}>
                          <input type="hidden" name="announcementId" value={item.id} />
                          <Button type="submit" variant="outline" size="sm">Delete</Button>
                        </form>
                        <details className="flex-1">
                          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">Edit</summary>
                          <form action={updateAnnouncement} className="mt-2 grid gap-2 sm:grid-cols-2">
                            <input type="hidden" name="announcementId" value={item.id} />
                            <label className="grid gap-1 text-sm font-medium sm:col-span-2">
                              Title
                              <input name="title" defaultValue={item.title} required className="rounded-md border bg-background px-3 py-2 text-sm" />
                            </label>
                            <label className="grid gap-1 text-sm font-medium sm:col-span-2">
                              Body
                              <textarea name="body" defaultValue={item.body ?? ''} rows={2} className="rounded-md border bg-background px-3 py-2 text-sm" />
                            </label>
                            <label className="grid gap-1 text-sm font-medium">
                              Start date
                              <input name="startDate" type="date" defaultValue={item.start_date ?? ''} className="rounded-md border bg-background px-3 py-2 text-sm" />
                            </label>
                            <label className="grid gap-1 text-sm font-medium">
                              End date
                              <input name="endDate" type="date" defaultValue={item.end_date ?? ''} className="rounded-md border bg-background px-3 py-2 text-sm" />
                            </label>
                            <label className="grid gap-1 text-sm font-medium">
                              Placement
                              <select name="placement" defaultValue={item.placement} className="rounded-md border bg-background px-3 py-2 text-sm">
                                <option value="PROGRAM_TOP">Program top</option>
                                <option value="PROGRAM_BOTTOM">Program bottom</option>
                              </select>
                            </label>
                            <label className="mt-7 inline-flex items-center gap-2 text-sm font-medium">
                              <input name="isPermanent" type="checkbox" defaultChecked={item.is_permanent} className="h-4 w-4 rounded border" />
                              Permanent
                            </label>
                            <div className="sm:col-span-2">
                              <Button type="submit" size="sm">Save changes</Button>
                            </div>
                          </form>
                        </details>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No {group.title.toLowerCase()} announcements.</p>
            )}
          </section>
        ))}
      </main>
    );
  } catch {
    await client.query('ROLLBACK');
    throw new Error('Failed to load announcements');
  } finally {
    client.release();
  }
}
