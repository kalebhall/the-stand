import { notFound, redirect } from 'next/navigation';

import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canViewMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { toYyyyMmDd } from '@/src/meetings/date';
import { buildMeetingRenderHtml } from '@/src/meetings/render';
import type { IntroductionRoles } from '@/src/meetings/types';

type MeetingRow = {
  meeting_date: string;
  meeting_type: string;
  status: string;
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
  include_in_program: boolean;
};

type RenderRow = {
  render_html: string;
  version: number;
};

type LayoutRow = {
  preset: 'SINGLE_SHEET_BIFOLD' | 'TRI_FOLD_BULLETIN' | 'FULL_PAGE';
  announcement_mode: 'NONE' | 'AFTER_PROGRAM' | 'BACK_PANEL';
  cover_mode: 'NONE' | 'AUTHORIZED_IMAGE';
  cover_image_url: string | null;
  cover_image_alt_text: string | null;
};

export default async function PrintMeetingPage({
  params,
  searchParams
}: {
  params: Promise<{ meetingId: string }>;
  searchParams: Promise<{ version?: string; draft?: string }>;
}) {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);

  if (!session.activeWardId || !canViewMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) {
    redirect('/meetings');
  }

  const { meetingId } = await params;
  const { version, draft } = await searchParams;
  const versionNumber = Number(version);
  const requestedVersion = Number.isInteger(versionNumber) && versionNumber > 0 ? versionNumber : null;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId: session.activeWardId });

    const meetingResult = await client.query(
      'SELECT meeting_date, meeting_type, status FROM meeting WHERE id = $1::uuid AND ward_id = $2::uuid LIMIT 1',
      [meetingId, session.activeWardId]
    );

    if (!meetingResult.rowCount) {
      await client.query('ROLLBACK');
      notFound();
    }

    const renderResult = draft === '1'
      ? { rowCount: 0, rows: [] }
      : requestedVersion
      ? await client.query(
          'SELECT render_html, version FROM meeting_program_render WHERE meeting_id = $1::uuid AND ward_id = $2::uuid AND version = $3::int LIMIT 1',
          [meetingId, session.activeWardId, requestedVersion]
        )
      : await client.query(
          'SELECT render_html, version FROM meeting_program_render WHERE meeting_id = $1::uuid AND ward_id = $2::uuid ORDER BY version DESC LIMIT 1',
          [meetingId, session.activeWardId]
        );

    if (renderResult.rowCount) {
      const publishedRender = renderResult.rows[0] as RenderRow;
      await client.query('COMMIT');
      return (
        <>
          <main dangerouslySetInnerHTML={{ __html: publishedRender.render_html }} />
          <p className="mx-auto max-w-3xl px-4 pb-8 text-right text-xs text-muted-foreground sm:px-8">
            Published version {publishedRender.version}
          </p>
        </>
      );
    }

    const meeting = meetingResult.rows[0] as MeetingRow;
    // pg returns `date` columns as JS Date objects — normalise to YYYY-MM-DD string
    const meetingDate = toYyyyMmDd(meeting.meeting_date);

    const programResult = await client.query(
      `SELECT id, item_type, title, notes, topic, program_notes, hymn_number, hymn_title, introduction_roles
         FROM meeting_program_item
        WHERE meeting_id = $1::uuid AND ward_id = $2::uuid
        ORDER BY sequence ASC`,
      [meetingId, session.activeWardId]
    );

    const announcementResult = await client.query(
      `SELECT title, body, start_date, end_date, is_permanent, placement, include_in_program
         FROM announcement
        WHERE ward_id = $1::uuid
        ORDER BY created_at DESC`,
      [session.activeWardId]
    );

    const layoutResult = await client.query(
      'SELECT preset, announcement_mode, cover_mode, cover_image_url, cover_image_alt_text FROM public_program_layout WHERE ward_id = $1::uuid LIMIT 1',
      [session.activeWardId]
    );
    const layout = (layoutResult.rows?.[0] as LayoutRow | undefined) ?? { preset: 'FULL_PAGE' as const, announcement_mode: 'AFTER_PROGRAM' as const, cover_mode: 'NONE' as const, cover_image_url: null, cover_image_alt_text: null };

    const renderHtml = buildMeetingRenderHtml({
      meetingDate,
      meetingType: meeting.meeting_type,
      programItems: (programResult.rows as ProgramItemRow[]).map((item) => ({
        itemType: item.item_type,
        title: item.title,
        notes: item.notes,
        topic: item.topic,
        programNotes: item.program_notes,
        hymnNumber: item.hymn_number,
        hymnTitle: item.hymn_title,
        introductionRoles: item.introduction_roles
      })),
      announcements: (announcementResult.rows as AnnouncementRow[]).map((item) => ({
        title: item.title,
        body: item.body,
        startDate: toYyyyMmDd(item.start_date) || null,
        endDate: toYyyyMmDd(item.end_date) || null,
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
      }
    });

    await client.query('COMMIT');

    return (
      <>
        <main dangerouslySetInnerHTML={{ __html: renderHtml }} />
        {meeting.status === 'PUBLISHED' ? (
          <p className="mx-auto max-w-3xl px-4 pb-8 text-right text-xs text-muted-foreground sm:px-8">
            Published snapshot unavailable; showing current draft layout.
          </p>
        ) : null}
      </>
    );
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Fatal Print View Error]', error);
    throw new Error('Failed to load print view', { cause: error });
  } finally {
    client.release();
  }
}
