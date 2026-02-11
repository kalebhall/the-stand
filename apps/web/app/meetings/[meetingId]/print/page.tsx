import { notFound, redirect } from 'next/navigation';

import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canViewMeetings } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { buildMeetingRenderHtml } from '@/src/meetings/render';

type MeetingRow = {
  meeting_date: string;
  meeting_type: string;
  status: string;
};

type ProgramItemRow = {
  item_type: string;
  title: string | null;
  notes: string | null;
  hymn_number: string | null;
  hymn_title: string | null;
};

type AnnouncementRow = {
  title: string;
  body: string | null;
  start_date: string | null;
  end_date: string | null;
  is_permanent: boolean;
  placement: 'PROGRAM_TOP' | 'PROGRAM_BOTTOM';
};

type RenderRow = {
  render_html: string;
  version: number;
};

export default async function PrintMeetingPage({
  params,
  searchParams
}: {
  params: Promise<{ meetingId: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);

  if (!session.activeWardId || !canViewMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) {
    redirect('/meetings');
  }

  const { meetingId } = await params;
  const { version } = await searchParams;
  const versionNumber = Number(version);
  const requestedVersion = Number.isInteger(versionNumber) && versionNumber > 0 ? versionNumber : null;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId: session.activeWardId });

    const meetingResult = await client.query('SELECT meeting_date, meeting_type, status FROM meeting WHERE id = $1 AND ward_id = $2 LIMIT 1', [
      meetingId,
      session.activeWardId
    ]);

    if (!meetingResult.rowCount) {
      await client.query('ROLLBACK');
      notFound();
    }

    const renderResult = requestedVersion
      ? await client.query('SELECT render_html, version FROM meeting_program_render WHERE meeting_id = $1 AND ward_id = $2 AND version = $3 LIMIT 1', [
          meetingId,
          session.activeWardId,
          requestedVersion
        ])
      : await client.query(
          'SELECT render_html, version FROM meeting_program_render WHERE meeting_id = $1 AND ward_id = $2 ORDER BY version DESC LIMIT 1',
          [meetingId, session.activeWardId]
        );

    if (renderResult.rowCount) {
      const publishedRender = renderResult.rows[0] as RenderRow;
      await client.query('COMMIT');
      return (
        <>
          <main dangerouslySetInnerHTML={{ __html: publishedRender.render_html }} />
          <p className="mx-auto max-w-3xl px-4 pb-8 text-right text-xs text-muted-foreground sm:px-8">Published version {publishedRender.version}</p>
        </>
      );
    }

    const meeting = meetingResult.rows[0] as MeetingRow;

    const programResult = await client.query(
      `SELECT item_type, title, notes, hymn_number, hymn_title
         FROM meeting_program_item
        WHERE meeting_id = $1 AND ward_id = $2
        ORDER BY sequence ASC`,
      [meetingId, session.activeWardId]
    );

    const announcementResult = await client.query(
      `SELECT title, body, start_date, end_date, is_permanent, placement
         FROM announcement
        WHERE ward_id = $1
        ORDER BY created_at DESC`,
      [session.activeWardId]
    );

    const renderHtml = buildMeetingRenderHtml({
      meetingDate: meeting.meeting_date,
      meetingType: meeting.meeting_type,
      programItems: (programResult.rows as ProgramItemRow[]).map((item) => ({
        itemType: item.item_type,
        title: item.title,
        notes: item.notes,
        hymnNumber: item.hymn_number,
        hymnTitle: item.hymn_title
      })),
      announcements: (announcementResult.rows as AnnouncementRow[]).map((item) => ({
        title: item.title,
        body: item.body,
        startDate: item.start_date,
        endDate: item.end_date,
        isPermanent: item.is_permanent,
        placement: item.placement
      }))
    });

    await client.query('COMMIT');

    return (
      <>
        <main dangerouslySetInnerHTML={{ __html: renderHtml }} />
        {meeting.status === 'PUBLISHED' ? (
          <p className="mx-auto max-w-3xl px-4 pb-8 text-right text-xs text-muted-foreground sm:px-8">Published snapshot unavailable; showing current draft layout.</p>
        ) : null}
      </>
    );
  } catch {
    await client.query('ROLLBACK');
    throw new Error('Failed to load print view');
  } finally {
    client.release();
  }
}
