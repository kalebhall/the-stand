import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canViewMeetings } from '@/src/auth/roles';
import { isMeetingStatus, isMeetingType } from '@/src/conducting/model';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

import {
  adaptLegacyLayoutToAdvancedDocument,
  COMPATIBILITY_PUBLIC_BLOCK_TYPES,
  LEGACY_COVER_ASSET_ID
} from '@/src/document-designer/legacy-layout-adapter';
import { resolveDocumentData } from '@/src/document-designer/data-resolver';
import { renderDocumentHtml } from '@/src/document-designer/renderer';
import { buildPublicPreviewSource } from '@/src/document-designer/meeting-document-service';

export async function GET(_: Request, context: { params: Promise<{ wardId: string; meetingId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  const { wardId, meetingId } = await context.params;
  if (!canViewMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const meetingResult = await client.query(
      `SELECT m.id, m.meeting_date, m.meeting_type, m.status, m.location, w.default_locale, w.name AS ward_name
         FROM meeting m JOIN ward w ON w.id = m.ward_id
        WHERE m.id = $1::uuid AND m.ward_id = $2::uuid LIMIT 1`,
      [meetingId, wardId]
    );
    if (!meetingResult.rows[0]) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Meeting not found', code: 'NOT_FOUND' }, { status: 404 });
    }
    const row = meetingResult.rows[0] as {
      id: string;
      meeting_date: string;
      meeting_type: string;
      status: string;
      location: string | null;
      default_locale: string | null;
      ward_name: string;
    };
    if (!isMeetingType(row.meeting_type) || !isMeetingStatus(row.status)) throw new Error('Meeting has an invalid canonical value.');
    const items = await client.query(
      `SELECT id, sequence, item_type, title,
              topic, program_notes, hymn_number, hymn_title, introduction_roles, speaker_status
         FROM meeting_program_item
        WHERE meeting_id = $1::uuid AND ward_id = $2::uuid ORDER BY sequence ASC`,
      [meetingId, wardId]
    );
    const document = await client.query(
      "SELECT layout_json FROM meeting_document WHERE meeting_id = $1::uuid AND ward_id = $2::uuid AND document_type = 'SACRAMENT_PROGRAM' LIMIT 1",
      [meetingId, wardId]
    );
    const legacy = await client.query(
      'SELECT preset, announcement_mode, cover_mode, cover_image_url, cover_image_alt_text FROM public_program_layout WHERE ward_id = $1::uuid LIMIT 1',
      [wardId]
    );
    const share = await client.query(
      `SELECT token FROM public_program_share
        WHERE ward_id = $1::uuid AND meeting_id = $2::uuid
          AND active_render_id IS NOT NULL
          AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1`,
      [wardId, meetingId]
    );
    const announcements = await client.query(
      `SELECT title FROM announcement
        WHERE ward_id = $1::uuid AND include_in_program = TRUE
          AND (is_permanent = TRUE OR ((start_date IS NULL OR start_date <= $2::date) AND (end_date IS NULL OR end_date >= $2::date)))
        ORDER BY created_at DESC`,
      [wardId, row.meeting_date]
    );
    const media = await client.query(
      `SELECT id, alt_text, is_decorative FROM media_asset
        WHERE status = 'ACTIVE'
          AND (scope_type = 'SYSTEM' OR (scope_type = 'WARD' AND ward_id = $1::uuid)
            OR (scope_type = 'STAKE' AND stake_id = (SELECT stake_id FROM ward WHERE id = $1::uuid)))`,
      [wardId]
    );
    await client.query('COMMIT');

    const source = buildPublicPreviewSource(
      { meetingDate: String(row.meeting_date), meetingType: row.meeting_type, wardName: row.ward_name, locale: row.default_locale },
      items.rows.map((item) => ({
        sequence: item.sequence,
        itemType: item.item_type,
        title: item.title,
        topic: item.topic,
        programNotes: item.program_notes,
        hymnNumber: item.hymn_number,
        hymnTitle: item.hymn_title,
        introductionRoles: item.introduction_roles
      })),
      announcements.rows as Array<{ title: string }>
    );
    const legacyRow = legacy.rows[0] as
      | {
          preset: 'SINGLE_SHEET_BIFOLD' | 'TRI_FOLD_BULLETIN' | 'FULL_PAGE';
          announcement_mode: 'NONE' | 'AFTER_PROGRAM' | 'BACK_PANEL';
          cover_mode: 'NONE' | 'AUTHORIZED_IMAGE';
          cover_image_url: string | null;
          cover_image_alt_text: string | null;
        }
      | undefined;
    const rawLayout =
      document.rows[0]?.layout_json ??
      adaptLegacyLayoutToAdvancedDocument({
        preset: legacyRow?.preset ?? 'FULL_PAGE',
        announcementMode: legacyRow?.announcement_mode ?? 'AFTER_PROGRAM',
        coverMode: legacyRow?.cover_mode ?? 'NONE',
        coverImageUrl: legacyRow?.cover_image_url ?? null,
        coverImageAltText: legacyRow?.cover_image_alt_text ?? null
      });
    const renderMedia = {
      ...Object.fromEntries(
        (media.rows as Array<{ id: string; alt_text: string | null; is_decorative: boolean }>).map((asset) => [
          asset.id,
          {
            url: `/api/w/${encodeURIComponent(wardId)}/media/${encodeURIComponent(asset.id)}`,
            altText: asset.alt_text,
            isDecorative: asset.is_decorative
          }
        ])
      ),
      ...(!document.rows[0] && legacyRow?.cover_mode === 'AUTHORIZED_IMAGE' && legacyRow.cover_image_url
        ? { [LEGACY_COVER_ASSET_ID]: { url: legacyRow.cover_image_url, altText: legacyRow.cover_image_alt_text, isDecorative: false } }
        : {})
    };
    const sourceData = {
      ...source,
      location: row.location,
      publicUrl: share.rows[0]?.token ? `${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}/p/${share.rows[0].token}` : null,
      media: renderMedia
    };
    const { layout, data } = resolveDocumentData(rawLayout, sourceData, {
      public: true,
      explicitPublicBlockTypes: COMPATIBILITY_PUBLIC_BLOCK_TYPES,
      advancedProjection: true,
      preserveAdvancedLayout: true
    });
    return new NextResponse(
      renderDocumentHtml({ layout, data, public: true, explicitPublicBlockTypes: COMPATIBILITY_PUBLIC_BLOCK_TYPES }).html,
      { headers: { 'content-type': 'text/html; charset=utf-8' } }
    );
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return NextResponse.json({ error: 'Failed to render program', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
