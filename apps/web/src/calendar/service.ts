import type { PoolClient } from 'pg';

import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

import { parseIcsEvents, type ParsedCalendarEvent } from './ics';

type FeedScope = 'WARD' | 'STAKE' | 'CHURCH';
type AnnouncementPlacement = 'PROGRAM_TOP' | 'PROGRAM_BOTTOM';

type CalendarFeedRow = {
  id: string;
  ward_id: string;
  display_name: string;
  feed_scope: FeedScope;
  feed_url: string;
  tag_map: Record<string, unknown> | null;
};

type TagMapRule = {
  placement?: AnnouncementPlacement;
  isPermanent?: boolean;
};

type RefreshReason = 'login' | 'manual';

type RefreshSummary = {
  feedId: string;
  imported: number;
};

function normalizeTag(value: string): string {
  return value.trim().toLowerCase();
}

function resolveTagRule(feed: CalendarFeedRow, eventTags: string[]): TagMapRule {
  const rawTagMap = feed.tag_map;
  if (!rawTagMap || typeof rawTagMap !== 'object') {
    return {};
  }

  const record = rawTagMap as Record<string, unknown>;
  for (const tag of eventTags) {
    const normalizedTag = normalizeTag(tag);
    const candidate = record[normalizedTag];
    if (candidate && typeof candidate === 'object') {
      return candidate as TagMapRule;
    }
  }

  const defaultRule = record.default;
  if (defaultRule && typeof defaultRule === 'object') {
    return defaultRule as TagMapRule;
  }

  return {};
}

function toDateOnly(isoTimestamp: string | null): string | null {
  if (!isoTimestamp) {
    return null;
  }

  return isoTimestamp.slice(0, 10);
}

export async function pruneCalendarEventCache(client: PoolClient): Promise<number> {
  const pruned = await client.query(
    `DELETE FROM calendar_event_cache
      WHERE ward_id = app.current_ward_id()
        AND starts_at < now() - interval '7 days'`
  );

  return pruned.rowCount ?? 0;
}

export async function refreshCalendarFeedsForWard(args: { wardId: string; userId: string; reason: RefreshReason }): Promise<RefreshSummary[]> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { wardId: args.wardId, userId: args.userId });

    const feedsResult = await client.query(
      `SELECT id, ward_id, display_name, feed_scope, feed_url, tag_map
         FROM calendar_feed
        WHERE ward_id = $1
          AND is_active = true
        ORDER BY created_at ASC`,
      [args.wardId]
    );

    const summaries: RefreshSummary[] = [];

    for (const feed of feedsResult.rows as CalendarFeedRow[]) {
      try {
        const response = await fetch(feed.feed_url, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Feed responded with ${response.status}`);
        }

        const icsBody = await response.text();
        const events = parseIcsEvents(icsBody);

        let imported = 0;
        for (const event of events) {
          await upsertCachedEvent(client, { wardId: args.wardId, feed, event });
          imported += 1;
        }

        await client.query(
          `UPDATE calendar_feed
              SET last_refreshed_at = now(),
                  last_refresh_status = 'SUCCESS',
                  last_refresh_error = NULL
            WHERE id = $1
              AND ward_id = $2`,
          [feed.id, args.wardId]
        );

        summaries.push({ feedId: feed.id, imported });
      } catch (error) {
        await client.query(
          `UPDATE calendar_feed
              SET last_refreshed_at = now(),
                  last_refresh_status = 'ERROR',
                  last_refresh_error = $3
            WHERE id = $1
              AND ward_id = $2`,
          [feed.id, args.wardId, error instanceof Error ? error.message.slice(0, 500) : 'Unknown refresh error']
        );
      }
    }

    await pruneCalendarEventCache(client);

    if (args.reason === 'manual') {
      await client.query(
        `INSERT INTO audit_log (ward_id, user_id, action, details)
         VALUES ($1, $2, 'CALENDAR_REFRESH_MANUAL', jsonb_build_object('feedsProcessed', $3))`,
        [args.wardId, args.userId, summaries.length]
      );
    }

    await client.query('COMMIT');
    return summaries;
  } catch {
    await client.query('ROLLBACK');
    throw new Error('Failed to refresh calendar feeds');
  } finally {
    client.release();
  }
}

async function upsertCachedEvent(
  client: PoolClient,
  args: { wardId: string; feed: CalendarFeedRow; event: ParsedCalendarEvent }
): Promise<void> {
  await client.query(
    `INSERT INTO calendar_event_cache (
       ward_id,
       calendar_feed_id,
       external_uid,
       title,
       description,
       location,
       starts_at,
       ends_at,
       all_day,
       tags,
       source_updated_at,
       imported_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9, $10::text[], $11::timestamptz, now())
     ON CONFLICT (ward_id, calendar_feed_id, external_uid, starts_at)
     DO UPDATE SET
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       location = EXCLUDED.location,
       ends_at = EXCLUDED.ends_at,
       all_day = EXCLUDED.all_day,
       tags = EXCLUDED.tags,
       source_updated_at = EXCLUDED.source_updated_at,
       imported_at = now()`,
    [
      args.wardId,
      args.feed.id,
      args.event.uid,
      args.event.title,
      args.event.description,
      args.event.location,
      args.event.startsAt,
      args.event.endsAt,
      args.event.allDay,
      args.event.tags,
      args.event.sourceUpdatedAt
    ]
  );
}

export async function copyCalendarEventToAnnouncement(args: { wardId: string; userId: string; calendarEventCacheId: string }): Promise<string> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { wardId: args.wardId, userId: args.userId });

    const eventResult = await client.query(
      `SELECT ec.id,
              ec.title,
              ec.description,
              ec.starts_at,
              ec.ends_at,
              ec.tags,
              ec.copied_to_announcement_at,
              cf.tag_map
         FROM calendar_event_cache ec
         INNER JOIN calendar_feed cf ON cf.id = ec.calendar_feed_id
        WHERE ec.id = $1
          AND ec.ward_id = $2
        LIMIT 1`,
      [args.calendarEventCacheId, args.wardId]
    );

    if (!eventResult.rowCount) {
      throw new Error('Calendar event not found');
    }

    const event = eventResult.rows[0] as {
      id: string;
      title: string;
      description: string | null;
      starts_at: string;
      ends_at: string | null;
      tags: string[];
      copied_to_announcement_at: string | null;
      tag_map: Record<string, unknown> | null;
    };

    const fakeFeed = { id: '', ward_id: args.wardId, display_name: '', feed_scope: 'WARD' as FeedScope, feed_url: '', tag_map: event.tag_map };
    const rule = resolveTagRule(fakeFeed, event.tags ?? []);
    const placement = rule.placement === 'PROGRAM_BOTTOM' ? 'PROGRAM_BOTTOM' : 'PROGRAM_TOP';
    const isPermanent = Boolean(rule.isPermanent);

    const inserted = await client.query(
      `INSERT INTO announcement (ward_id, title, body, start_date, end_date, is_permanent, placement)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        args.wardId,
        event.title,
        event.description,
        isPermanent ? null : toDateOnly(event.starts_at),
        isPermanent ? null : toDateOnly(event.ends_at) ?? toDateOnly(event.starts_at),
        isPermanent,
        placement
      ]
    );

    await client.query('UPDATE calendar_event_cache SET copied_to_announcement_at = now() WHERE id = $1 AND ward_id = $2', [event.id, args.wardId]);

    await client.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES ($1, $2, 'CALENDAR_EVENT_COPIED_TO_ANNOUNCEMENT', jsonb_build_object('calendarEventCacheId', $3, 'announcementId', $4))`,
      [args.wardId, args.userId, event.id, inserted.rows[0].id]
    );

    await client.query('COMMIT');

    return inserted.rows[0].id as string;
  } catch {
    await client.query('ROLLBACK');
    throw new Error('Failed to copy calendar event to announcement');
  } finally {
    client.release();
  }
}
