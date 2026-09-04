import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';

import { recordAuditEvent } from '@/src/audit/service';
import { auth } from '@/src/auth/auth';
import { canManageMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { buildMeetingRenderHtml } from '@/src/meetings/render';
import type { IntroductionRoles } from '@/src/meetings/types';
import { enqueueOutboxNotificationJob } from '@/src/notifications/queue';

type MeetingRow = {
  id: string;
  meeting_date: string;
  meeting_type: string;
};

type ProgramItemRow = {
  item_type: string;
  title: string | null;
  notes: string | null;
  program_notes: string | null;
  hymn_number: string | null;
  hymn_title: string | null;
  introduction_roles: IntroductionRoles | null;
};

type AnnouncementRow = {
  title: string;
  body: string | null;
  start_date: string | null;
  end_date: string | null;
  is_permanent: boolean;
  placement: 'PROGRAM_TOP' | 'PROGRAM_BOTTOM';
};

function generatePublicToken(): string {
  return randomBytes(24).toString('base64url');
}

export async function POST(_: Request, context: { params: Promise<{ wardId: string; meetingId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId, meetingId } = await context.params;
  if (!canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const meetingResult = await client.query(
      `SELECT id, meeting_date, meeting_type
         FROM meeting
        WHERE id = $1::uuid AND ward_id = $2::uuid
        LIMIT 1
        FOR UPDATE`,
      [meetingId, wardId]
    );

    if (!meetingResult.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Meeting not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const programResult = await client.query(
      `SELECT item_type, title, notes, program_notes, hymn_number, hymn_title, introduction_roles
         FROM meeting_program_item
        WHERE meeting_id = $1::uuid AND ward_id = $2::uuid
        ORDER BY sequence ASC`,
      [meetingId, wardId]
    );

    const announcementResult = await client.query(
      `SELECT title, body, start_date, end_date, is_permanent, placement, include_in_program
         FROM announcement
        WHERE ward_id = $1::uuid
        ORDER BY created_at DESC`,
      [wardId]
    );

    const versionResult = await client.query(
      'SELECT COALESCE(MAX(version), 0)::int AS latest_version FROM meeting_program_render WHERE meeting_id = $1::uuid',
      [meetingId]
    );

    const nextVersion = Number(versionResult.rows[0].latest_version) + 1;
    const meeting = meetingResult.rows[0] as MeetingRow;
    const programItems = (programResult.rows as ProgramItemRow[]).map((item) => ({
      itemType: item.item_type,
      title: item.title,
      notes: item.notes,
      programNotes: item.program_notes,
      hymnNumber: item.hymn_number,
      hymnTitle: item.hymn_title,
      introductionRoles: item.introduction_roles
    }));

    const renderHtml = buildMeetingRenderHtml({
      meetingDate: meeting.meeting_date,
      meetingType: meeting.meeting_type,
      programItems,
      announcements: (announcementResult.rows as (AnnouncementRow & { include_in_program: boolean })[]).map((item) => ({
        title: item.title,
        body: item.body,
        startDate: item.start_date,
        endDate: item.end_date,
        isPermanent: item.is_permanent,
        placement: item.placement,
        includeInProgram: item.include_in_program
      }))
    });

    await client.query(
      `INSERT INTO meeting_program_render (ward_id, meeting_id, version, render_html)
       VALUES ($1::uuid, $2::uuid, $3::int, $4::text)`,
      [wardId, meetingId, nextVersion, renderHtml]
    );

    await client.query(
      `UPDATE meeting
          SET status = 'PUBLISHED',
              updated_at = now()
        WHERE id = $1::uuid AND ward_id = $2::uuid`,
      [meetingId, wardId]
    );

    await client.query(
      `INSERT INTO public_program_share (ward_id, meeting_id, token)
       VALUES ($1::uuid, $2::uuid, $3::text)
       ON CONFLICT (meeting_id) DO NOTHING`,
      [wardId, meetingId, generatePublicToken()]
    );

    await client.query(
      `INSERT INTO public_program_portal (ward_id, token)
       VALUES ($1::uuid, $2::text)
       ON CONFLICT (ward_id) DO NOTHING`,
      [wardId, generatePublicToken()]
    );

    const eventType = nextVersion > 1 ? 'MEETING_REPUBLISHED' : 'MEETING_PUBLISHED';

    await recordAuditEvent(client, {
      wardId,
      userId: session.user.id,
      actorName: session.user.name || session.user.email || null,
      action: eventType,
      entityType: 'meeting',
      entityId: meetingId,
      meetingDate: meeting.meeting_date,
      changes: {
        status: { old: 'DRAFT', new: 'PUBLISHED' },
        version: { old: nextVersion - 1, new: nextVersion }
      },
      details: {
        meetingId,
        version: nextVersion,
        meetingDate: meeting.meeting_date,
        meetingType: meeting.meeting_type
      },
      source: 'manual_ui',
      severity: 'notice'
    });

    const outboxResult = await client.query(
      `INSERT INTO event_outbox (ward_id, aggregate_type, aggregate_id, event_type, payload)
       VALUES ($1::uuid, 'meeting', $2::uuid, $3::text, $4::jsonb)
       ON CONFLICT (ward_id, event_type, aggregate_id)
       DO UPDATE SET payload = EXCLUDED.payload, updated_at = now(), status = 'pending'
       RETURNING id`,
      [wardId, meetingId, eventType, JSON.stringify({ meetingId, version: nextVersion })]
    );

    const eventOutboxId = outboxResult.rows[0].id as string;

    await client.query('COMMIT');

    // Fire-and-forget: enqueue notification without blocking the response
    Promise.resolve(enqueueOutboxNotificationJob({ wardId, eventOutboxId })).catch((err) => {
      console.error('[publish] Failed to enqueue notification job', err);
    });

    return NextResponse.json({ success: true, meetingId, version: nextVersion, status: 'PUBLISHED' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[publish] Failed to publish meeting', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Failed to publish meeting', code: 'INTERNAL_ERROR', detail: message }, { status: 500 });
  } finally {
    client.release();
  }
}
