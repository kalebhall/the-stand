import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';

import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canViewMeetings } from '@/src/auth/roles';

import { resolveDocumentData } from '@/src/document-designer/data-resolver';
import { renderDocumentHtml } from '@/src/document-designer/renderer';
import { isAdvancedLayout, parseAdvancedLayout, projectAdvancedLayoutForOutput } from '@/src/document-designer/advanced-schema';
import { parseDocumentLayout } from '@/src/document-designer/schema';
import {
  adaptLegacyLayoutToAdvancedDocument,
  COMPATIBILITY_PUBLIC_BLOCK_TYPES,
  LEGACY_COVER_ASSET_ID
} from '@/src/document-designer/legacy-layout-adapter';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { toYyyyMmDd } from '@/src/meetings/date';
import { buildPublicPreviewSource } from '@/src/document-designer/meeting-document-service';

import type { IntroductionRoles } from '@/src/meetings/types';
import type { ResolvedDocumentData } from '@/src/document-designer/render-types';

type MeetingRow = {
  meeting_date: string;
  meeting_type: string;
  status: string;
  ward_name: string;
  location: string | null;
  default_locale: string;
};

type ProgramItemRow = {
  item_type: string;
  title: string | null;

  topic: string | null;
  program_notes: string | null;
  hymn_number: string | null;
  hymn_title: string | null;
  hymn_locale: string | null;
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
  layout_json: unknown;
  render_data_json: ResolvedDocumentData;
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
  const tPrint = await getTranslations('print');

  enforcePasswordRotation(session);

  if (!session.activeWardId || !canViewMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) {
    redirect('/meetings');
  }

  const { meetingId } = await params;
  const { version, draft } = await searchParams;
  const versionNumber = Number(version);
  const requestedVersion = Number.isInteger(versionNumber) && versionNumber > 0 ? versionNumber : null;
  const hasExplicitVersion = version !== undefined;
  const wardId = session.activeWardId;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId: session.activeWardId });

    const meetingResult = await client.query(
      'SELECT m.meeting_date, m.meeting_type, m.status, w.name AS ward_name, w.default_locale, m.location FROM meeting m JOIN ward w ON w.id = m.ward_id WHERE m.id = $1::uuid AND m.ward_id = $2::uuid LIMIT 1',
      [meetingId, session.activeWardId]
    );

    if (!meetingResult.rowCount) {
      await client.query('ROLLBACK');
      notFound();
    }

    if (hasExplicitVersion && requestedVersion === null && draft !== '1') {
      await client.query('ROLLBACK');
      notFound();
    }

    const renderResult =
      draft === '1'
        ? { rowCount: 0, rows: [] }
        : hasExplicitVersion && requestedVersion
          ? await client.query(
              `SELECT r.render_html, r.version, r.layout_json, r.render_data_json
                 FROM meeting_program_render r
                 LEFT JOIN public_program_share s
                   ON s.ward_id = r.ward_id AND s.meeting_id = r.meeting_id AND s.active_render_id = r.id
                WHERE r.meeting_id = $1::uuid
                  AND r.ward_id = $2::uuid
                  AND r.version = $3::int
                  AND r.published_at IS NOT NULL
                  AND r.layout_json IS NOT NULL
                  AND r.render_data_json IS NOT NULL
                  AND (s.active_render_id IS NULL OR s.expires_at IS NULL OR s.expires_at > now())
                LIMIT 1`,
              [meetingId, session.activeWardId, requestedVersion]
            )
          : await client.query(
              `SELECT r.render_html, r.version, r.layout_json, r.render_data_json
                 FROM public_program_share s
                 JOIN meeting_program_render r
                   ON r.id = s.active_render_id AND r.ward_id = s.ward_id AND r.meeting_id = s.meeting_id
                WHERE s.meeting_id = $1::uuid
                  AND s.ward_id = $2::uuid
                  AND s.active_render_id IS NOT NULL
                  AND (s.expires_at IS NULL OR s.expires_at > now())
                  AND r.published_at IS NOT NULL
                  AND r.layout_json IS NOT NULL
                  AND r.render_data_json IS NOT NULL
                LIMIT 1`,
              [meetingId, session.activeWardId]
            );

    if (renderResult.rowCount) {
      const publishedRender = renderResult.rows[0] as RenderRow;
      const publishedLayout = isAdvancedLayout(publishedRender.layout_json)
        ? projectAdvancedLayoutForOutput(parseAdvancedLayout(publishedRender.layout_json), 'PRINT', publishedRender.render_data_json)
        : parseDocumentLayout(publishedRender.layout_json);
      const printHtml = renderDocumentHtml({
        layout: publishedLayout,
        data: publishedRender.render_data_json,
        target: 'PRINT',
        public: true,
        explicitPublicBlockTypes: COMPATIBILITY_PUBLIC_BLOCK_TYPES
      }).html;
      await client.query('COMMIT');
      return (
        <>
          <div dangerouslySetInnerHTML={{ __html: printHtml }} />
          <p className="mx-auto max-w-3xl px-4 pb-8 text-right text-xs text-muted-foreground sm:px-8">
            {tPrint('publishedVersion', { version: publishedRender.version })}
          </p>
        </>
      );
    }

    if (hasExplicitVersion && draft !== '1') {
      await client.query('ROLLBACK');
      notFound();
    }

    const meeting = meetingResult.rows[0] as MeetingRow;
    // pg returns `date` columns as JS Date objects — normalise to YYYY-MM-DD string
    const meetingDate = toYyyyMmDd(meeting.meeting_date);

    const programResult = await client.query(
      `SELECT id, item_type, title, topic, program_notes, hymn_number, hymn_title, hymn_locale, introduction_roles
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
      "SELECT layout_json FROM meeting_document WHERE meeting_id = $1::uuid AND ward_id = $2::uuid AND document_type = 'SACRAMENT_PROGRAM' LIMIT 1",
      [meetingId, session.activeWardId]
    );
    const meetingDocumentLayout = meetingDocumentResult.rows?.[0]?.layout_json as unknown;

    const mediaResult = await client.query(
      `SELECT id, public_token, alt_text, is_decorative
         FROM media_asset
        WHERE status = 'ACTIVE'
          AND (scope_type = 'SYSTEM'
            OR (scope_type = 'WARD' AND ward_id = $1::uuid)
            OR (scope_type = 'STAKE' AND stake_id = (SELECT stake_id FROM ward WHERE id = $1::uuid)))`,
      [session.activeWardId]
    );
    const media = {
      ...Object.fromEntries(
        (mediaResult.rows as Array<{ id: string; alt_text: string | null; is_decorative: boolean }>).map((item) => [
          item.id,
          {
            url: `/api/w/${encodeURIComponent(wardId)}/media/${encodeURIComponent(item.id)}`,
            altText: item.alt_text,
            isDecorative: item.is_decorative
          }
        ])
      ),
      ...(!meetingDocumentLayout && layout.cover_mode === 'AUTHORIZED_IMAGE' && layout.cover_image_url
        ? { [LEGACY_COVER_ASSET_ID]: { url: layout.cover_image_url, altText: layout.cover_image_alt_text, isDecorative: false } }
        : {})
    };

    const publicSource = buildPublicPreviewSource(
      {
        meetingDate,
        meetingType: meeting.meeting_type,
        wardName: meeting.ward_name,
        locale: meeting.default_locale
      },
      (programResult.rows as ProgramItemRow[]).map((item, sequence) => ({
        sequence,
        itemType: item.item_type,
        title: item.title,
        topic: item.topic,
        programNotes: item.program_notes,
        hymnNumber: item.hymn_number,
        hymnTitle: item.hymn_title,
        introductionRoles: item.introduction_roles
      }))
    );

    {
      const { layout: documentLayout, data } = resolveDocumentData(
        meetingDocumentLayout ??
          adaptLegacyLayoutToAdvancedDocument({
            preset: layout.preset,
            announcementMode: layout.announcement_mode,
            coverMode: layout.cover_mode,
            coverImageUrl: layout.cover_image_url,
            coverImageAltText: layout.cover_image_alt_text
          }),
        {
          ...publicSource,
          location: meeting.location,
          publicValues: {
            ...publicSource.publicValues,
            ANNOUNCEMENTS: (announcementResult.rows as AnnouncementRow[]).map((item) => item.title).join(' · ')
          },
          media
        },
        {
          target: 'PRINT',
          public: true,
          explicitPublicBlockTypes: COMPATIBILITY_PUBLIC_BLOCK_TYPES,
          advancedProjection: true,
          preserveAdvancedLayout: true
        }
      );
      const compatibilityHtml = renderDocumentHtml({
        layout: documentLayout,
        data,
        target: 'PRINT',
        public: true,
        explicitPublicBlockTypes: COMPATIBILITY_PUBLIC_BLOCK_TYPES
      }).html;
      await client.query('COMMIT');
      return (
        <>
          <div dangerouslySetInnerHTML={{ __html: compatibilityHtml }} />
          {!meetingDocumentLayout && meeting.status === 'PUBLISHED' ? (
            <p className="mx-auto max-w-3xl px-4 pb-8 text-right text-xs text-muted-foreground sm:px-8">{tPrint('snapshotUnavailable')}</p>
          ) : null}
        </>
      );
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (
      error &&
      typeof error === 'object' &&
      'digest' in error &&
      typeof error.digest === 'string' &&
      error.digest.startsWith('NEXT_HTTP_ERROR_F')
    ) {
      throw error;
    }
    console.error('[Fatal Print View Error]', error);
    throw new Error('Failed to load print view', { cause: error });
  } finally {
    client.release();
  }
}
