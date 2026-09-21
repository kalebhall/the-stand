import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';

import { recordAuditEvent } from '@/src/audit/service';
import { auth } from '@/src/auth/auth';
import { canPublishProgram, canRepublishProgram, canViewProgramDesigner } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { resolveDocumentData } from '@/src/document-designer/data-resolver';
import { renderDocumentHtml } from '@/src/document-designer/renderer';
import { COMPATIBILITY_PUBLIC_BLOCK_TYPES } from '@/src/document-designer/legacy-layout-adapter';
import { buildMeetingRenderHtml } from '@/src/meetings/render';
import { getPublicProgramRenderLabels } from '@/src/i18n/public-program';
import { resolveLocale } from '@/src/i18n/config';
import type { IntroductionRoles } from '@/src/meetings/types';
import { enqueueOutboxNotificationJob } from '@/src/notifications/queue';

type MeetingRow = {
  id: string;
  meeting_date: string;
  meeting_type: string;
  status: string;
  ward_name: string;
  location: string | null;
};

type ProgramItemRow = {
  item_type: string;
  title: string | null;
  notes: string | null;
  topic: string | null;
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

type LayoutRow = {
  preset: 'SINGLE_SHEET_BIFOLD' | 'TRI_FOLD_BULLETIN' | 'FULL_PAGE';
  announcement_mode: 'NONE' | 'AFTER_PROGRAM' | 'BACK_PANEL';
  cover_mode: 'NONE' | 'AUTHORIZED_IMAGE';
  cover_image_url: string | null;
  cover_image_alt_text: string | null;
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
  if (!canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE meeting_program_render IN ROW EXCLUSIVE MODE');
    await setDbContext(client, { userId: session.user.id, wardId });

    const meetingResult = await client.query(
      `SELECT m.id, m.meeting_date, m.meeting_type, m.status, w.name AS ward_name, m.location
         FROM meeting m
         JOIN ward w ON w.id = m.ward_id
        WHERE m.id = $1::uuid AND m.ward_id = $2::uuid
        LIMIT 1
        FOR UPDATE`,
      [meetingId, wardId]
    );

    if (!meetingResult.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Meeting not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const programResult = await client.query(
      `SELECT item_type, title, notes, topic, program_notes, hymn_number, hymn_title, introduction_roles
         FROM meeting_program_item
        WHERE meeting_id = $1::uuid AND ward_id = $2::uuid
        ORDER BY sequence ASC`,
      [meetingId, wardId]
    );

    const announcementResult = await client.query(
      `SELECT title, body, start_date, end_date, is_permanent, placement, include_in_program
         FROM announcement
        WHERE ward_id = $1::uuid
          AND include_in_program = TRUE
          AND (
            is_permanent = TRUE
            OR (
              (start_date IS NULL OR start_date <= $2::date)
              AND (end_date IS NULL OR end_date >= $2::date)
            )
          )
        ORDER BY created_at DESC`,
      [wardId, meetingResult.rows[0].meeting_date]
    );

    const layoutResult = await client.query(
      'SELECT preset, announcement_mode, cover_mode, cover_image_url, cover_image_alt_text FROM public_program_layout WHERE ward_id = $1::uuid LIMIT 1',
      [wardId]
    );
    const layout = (layoutResult.rows?.[0] as LayoutRow | undefined) ?? {
      preset: 'FULL_PAGE' as const,
      announcement_mode: 'AFTER_PROGRAM' as const,
      cover_mode: 'NONE' as const,
      cover_image_url: null,
      cover_image_alt_text: null
    };

    const meetingDocumentResult = await client.query(
      'SELECT layout_json FROM meeting_document WHERE meeting_id = $1::uuid AND ward_id = $2::uuid AND document_type = \'SACRAMENT_PROGRAM\' LIMIT 1',
      [meetingId, wardId]
    );
    const meetingDocumentLayout = meetingDocumentResult.rows?.[0]?.layout_json as unknown;

    const shareTokenResult = await client.query(
      'SELECT token FROM public_program_share WHERE meeting_id = $1::uuid AND ward_id = $2::uuid LIMIT 1',
      [meetingId, wardId]
    );
    const shareToken = shareTokenResult.rows?.[0]?.token ?? generatePublicToken();

    const versionResult = await client.query(
      'SELECT COALESCE(MAX(version), 0)::int AS latest_version FROM meeting_program_render WHERE meeting_id = $1::uuid AND ward_id = $2::uuid',
      [meetingId, wardId]
    );

    const meeting = meetingResult.rows[0] as MeetingRow;
    const settingsResult = await client.query(
      `SELECT allow_program_editor_publish, allow_program_editor_republish
         FROM ward_document_settings
        WHERE ward_id = $1::uuid
        LIMIT 1`,
      [wardId]
    );
    const settings = settingsResult.rows[0] ?? {
      allow_program_editor_publish: false,
      allow_program_editor_republish: false
    };
    const permissionProfile = {
      allowProgramEditorPublish: settings.allow_program_editor_publish === true,
      allowProgramEditorRepublish: settings.allow_program_editor_republish === true
    };
    const allowed = meeting.status === 'PUBLISHED'
      ? canRepublishProgram(session.user, wardId, permissionProfile)
      : canPublishProgram(session.user, wardId, permissionProfile);
    if (!allowed) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const nextVersion = Number(versionResult.rows[0].latest_version) + 1;
    const localeResult = await client.query('SELECT preferred_locale FROM user_account WHERE id = $1::uuid AND is_active = true LIMIT 1', [
      session.user.id
    ]);
    const locale = resolveLocale(localeResult.rows[0]?.preferred_locale);
    const programItems = (programResult.rows as ProgramItemRow[]).map((item) => ({
      itemType: item.item_type,
      title: item.title,
      notes: item.notes,
      topic: item.topic,
      programNotes: item.program_notes,
      hymnNumber: item.hymn_number,
      hymnTitle: item.hymn_title,
      introductionRoles: item.introduction_roles
    }));

    const mediaResult = await client.query(
      `SELECT id, public_token, alt_text, is_decorative
         FROM media_asset
        WHERE status = 'ACTIVE'
          AND (scope_type = 'SYSTEM' OR ward_id = $1::uuid OR stake_id = (SELECT stake_id FROM ward WHERE id = $1::uuid))`,
      [wardId]
    );
    const media = Object.fromEntries((mediaResult.rows as Array<{ id: string; public_token: string | null; alt_text: string | null; is_decorative: boolean }>).filter((item) => item.public_token).map((item) => [item.id, { url: `/media/${item.public_token}`, altText: item.alt_text, isDecorative: item.is_decorative }]));

    const renderHtml = meetingDocumentLayout
      ? renderDocumentHtml({
          ...resolveDocumentData(
            meetingDocumentLayout,
            {
              meetingDate: meeting.meeting_date,
              meetingType: meeting.meeting_type,
              wardName: meeting.ward_name,
              location: meeting.location,
              publicUrl: `${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}/p/${shareToken}`,
              programItems: programItems.map((item, order) => ({
                order,
                label: item.title ?? item.hymnTitle ?? item.itemType,
                details: item.topic ?? null
              })),
              publicValues: {
                ANNOUNCEMENTS: (announcementResult.rows as AnnouncementRow[]).map((item) => item.title).join(' · ')
              },
              media
            },
            { public: true, explicitPublicBlockTypes: COMPATIBILITY_PUBLIC_BLOCK_TYPES }
          ),
          public: true,
          explicitPublicBlockTypes: COMPATIBILITY_PUBLIC_BLOCK_TYPES
        }).html
      : buildMeetingRenderHtml({
      publicUrl: `${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}/p/${shareToken}`,
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
      })),
      layout: {
        preset: layout.preset,
        announcementMode: layout.announcement_mode,
        coverMode: layout.cover_mode,
        coverImageUrl: layout.cover_image_url,
        coverImageAltText: layout.cover_image_alt_text
      },
      labels: getPublicProgramRenderLabels(locale, meeting.meeting_type)
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
      [wardId, meetingId, shareToken]
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
        status: { old: meeting.status || 'DRAFT', new: 'PUBLISHED' },
        version: { old: nextVersion - 1, new: nextVersion }
      },
      previousState: {
        status: meeting.status || 'DRAFT',
        version: nextVersion - 1
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
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[publish] Failed to publish meeting', error);
    return NextResponse.json({ error: 'Failed to publish meeting', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
