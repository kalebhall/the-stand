import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canViewMeetings } from '@/src/auth/roles';
import { resolveDocumentData } from '@/src/document-designer/data-resolver';
import { renderDocumentHtml } from '@/src/document-designer/renderer';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { toYyyyMmDd } from '@/src/meetings/date';
import { buildMeetingRenderHtml } from '@/src/meetings/render';
import type { IntroductionRoles } from '@/src/meetings/types';

type MeetingRow = {
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

const PRINT_ITEM_KEYS = {
  INTRODUCTION: 'item_INTRODUCTION',
  ANNOUNCEMENT: 'item_ANNOUNCEMENT',
  OPENING_HYMN: 'item_OPENING_HYMN',
  INVOCATION: 'item_INVOCATION',
  WARD_AND_STAKE_BUSINESS: 'item_WARD_AND_STAKE_BUSINESS',
  SACRAMENT_HYMN: 'item_SACRAMENT_HYMN',
  SACRAMENT: 'item_SACRAMENT',
  SPEAKER: 'item_SPEAKER',
  REST_HYMN: 'item_REST_HYMN',
  CLOSING_HYMN: 'item_CLOSING_HYMN',
  BENEDICTION: 'item_BENEDICTION',
  TESTIMONIES: 'item_TESTIMONIES'
} as const;

const MEETING_TYPE_KEYS = {
  SACRAMENT: 'type_SACRAMENT',
  FAST_TESTIMONY: 'type_FAST_TESTIMONY',
  WARD_CONFERENCE: 'type_WARD_CONFERENCE',
  STAKE_CONFERENCE: 'type_STAKE_CONFERENCE',
  GENERAL_CONFERENCE: 'type_GENERAL_CONFERENCE'
} as const;

export default async function PrintMeetingPage({
  params,
  searchParams
}: {
  params: Promise<{ meetingId: string }>;
  searchParams: Promise<{ version?: string; draft?: string }>;
}) {
  const session = await requireAuthenticatedSession();
  const tPrint = await getTranslations('print');
  const tMeetings = await getTranslations('meetings');
  enforcePasswordRotation(session);

  if (!session.activeWardId || !canViewMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) {
    redirect('/meetings');
  }

  const { meetingId } = await params;
  const { version, draft } = await searchParams;
  const versionNumber = Number(version);
  const requestedVersion = Number.isInteger(versionNumber) && versionNumber > 0 ? versionNumber : null;
  const wardId = session.activeWardId;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId: session.activeWardId });

    const meetingResult = await client.query(
      'SELECT m.meeting_date, m.meeting_type, m.status, w.name AS ward_name, m.location FROM meeting m JOIN ward w ON w.id = m.ward_id WHERE m.id = $1::uuid AND m.ward_id = $2::uuid LIMIT 1',
      [meetingId, session.activeWardId]
    );

    if (!meetingResult.rowCount) {
      await client.query('ROLLBACK');
      notFound();
    }

    const renderResult =
      draft === '1'
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
          <div dangerouslySetInnerHTML={{ __html: publishedRender.render_html }} />
          <p className="mx-auto max-w-3xl px-4 pb-8 text-right text-xs text-muted-foreground sm:px-8">
            {tPrint('publishedVersion', { version: publishedRender.version })}
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
          AND include_in_program = TRUE
          AND (
            is_permanent = TRUE
            OR (
              (start_date IS NULL OR start_date <= $2::date)
              AND (end_date IS NULL OR end_date >= $2::date)
            )
          )
        ORDER BY created_at DESC`,
      [session.activeWardId, meeting.meeting_date]
    );

    const layoutResult = await client.query(
      'SELECT preset, announcement_mode, cover_mode, cover_image_url, cover_image_alt_text FROM public_program_layout WHERE ward_id = $1::uuid LIMIT 1',
      [session.activeWardId]
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
      [meetingId, session.activeWardId]
    );
    const meetingDocumentLayout = meetingDocumentResult.rows?.[0]?.layout_json as unknown;

    const mediaResult = await client.query(
      `SELECT id, public_token, alt_text, is_decorative
         FROM media_asset
        WHERE status = 'ACTIVE'
          AND (scope_type = 'SYSTEM' OR ward_id = $1::uuid OR stake_id = (SELECT stake_id FROM ward WHERE id = $1::uuid))`,
      [session.activeWardId]
    );
    const media = Object.fromEntries((mediaResult.rows as Array<{ id: string; alt_text: string | null; is_decorative: boolean }>).map((item) => [item.id, { url: `/api/w/${encodeURIComponent(wardId)}/media/${encodeURIComponent(item.id)}`, altText: item.alt_text, isDecorative: item.is_decorative }]));

    if (meetingDocumentLayout) {
      const { layout: documentLayout, data } = resolveDocumentData(
        meetingDocumentLayout,
        {
          meetingDate,
          meetingType: meeting.meeting_type,
          wardName: meeting.ward_name,
          location: meeting.location,
          programItems: (programResult.rows as ProgramItemRow[]).map((item, order) => ({
            order,
            label: item.title ?? item.hymn_title ?? item.item_type,
            details: item.topic ?? null
          })),
          publicValues: {
            ANNOUNCEMENTS: (announcementResult.rows as AnnouncementRow[]).map((item) => item.title).join(' · ')
          },
          media
        },
        { target: 'PRINT' }
      );
      const compatibilityHtml = renderDocumentHtml({
        layout: documentLayout,
        data,
        target: 'PRINT',
        public: false,
      }).html;
      await client.query('COMMIT');
      return <div dangerouslySetInnerHTML={{ __html: compatibilityHtml }} />;
    }

    const renderLabels = {
      programTitle: tPrint('programTitle'),
      announcements: tPrint('announcements'),
      introduction: tPrint('introduction'),
      presiding: tPrint('presiding'),
      conducting: tPrint('conducting'),
      organistPianist: tPrint('organistPianist'),
      chorister: tPrint('chorister'),
      sacramentPrayers: tPrint('sacramentPrayers'),
      qrDigitalProgram: tPrint('qrDigitalProgram'),
      qrCode: tPrint('qrCode'),
      meetingTypeLabel: tMeetings(MEETING_TYPE_KEYS[meeting.meeting_type as keyof typeof MEETING_TYPE_KEYS] ?? 'type_UNKNOWN'),
      itemLabels: Object.fromEntries(Object.entries(PRINT_ITEM_KEYS).map(([itemType, key]) => [itemType, tPrint(key)]))
    };

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
      },
      labels: renderLabels
    });

    await client.query('COMMIT');

    return (
      <>
        <div dangerouslySetInnerHTML={{ __html: renderHtml }} />
        {meeting.status === 'PUBLISHED' ? (
          <p className="mx-auto max-w-3xl px-4 pb-8 text-right text-xs text-muted-foreground sm:px-8">{tPrint('snapshotUnavailable')}</p>
        ) : null}
      </>
    );
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[Fatal Print View Error]', error);
    throw new Error('Failed to load print view', { cause: error });
  } finally {
    client.release();
  }
}
