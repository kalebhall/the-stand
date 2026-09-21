import type { PoolClient } from 'pg';

import { downgradeToV1, parseAdvancedLayout } from './advanced-schema';
import { resolveDocumentData } from './data-resolver';
import { readMedia } from './media-storage';
import type { ResolvedDocumentData } from './render-types';
import type { DocumentLayout } from './types';

type PrintSource = 'draft' | 'published';

type StoredMedia = { storage_key: string; mime_type: string };

async function toDataUrl(client: PoolClient, wardId: string, url: string): Promise<string | null> {
  const token = url.match(/\/media\/([^/?#]+)/)?.[1];
  const result = token
    ? await client.query(
      `SELECT storage_key, mime_type FROM media_asset
        WHERE public_token = $1::text AND status = 'ACTIVE'
          AND (scope_type = 'SYSTEM'
            OR (scope_type = 'WARD' AND ward_id = $2::uuid)
            OR (scope_type = 'STAKE' AND stake_id = (SELECT stake_id FROM ward WHERE id = $2::uuid)))
        LIMIT 1`,
      [decodeURIComponent(token), wardId]
    )
    : { rows: [] };
  const row = result.rows[0] as StoredMedia | undefined;
  if (!row) return null;
  try {
    const bytes = await readMedia(row.storage_key);
    return `data:${row.mime_type};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}

async function hydrateMedia(client: PoolClient, wardId: string, media: ResolvedDocumentData['media']): Promise<ResolvedDocumentData['media']> {
  if (!media) return media;
  const hydrated: NonNullable<ResolvedDocumentData['media']> = {};
  for (const [assetId, asset] of Object.entries(media)) {
    if (!asset) continue;
    const url = asset.url.startsWith('data:image/') ? asset.url : await toDataUrl(client, wardId, asset.url);
    if (url) hydrated[assetId] = { ...asset, url };
  }
  return hydrated;
}

export async function loadPrintDocument(client: PoolClient, wardId: string, meetingId: string, source: PrintSource, version: number | null): Promise<{ layout: DocumentLayout; data: ResolvedDocumentData; wardName: string; publishedVersion: number | null } | null> {
  const meeting = await client.query(
    'SELECT w.name AS ward_name, m.meeting_date, m.meeting_type, m.location FROM meeting m JOIN ward w ON w.id = m.ward_id WHERE m.id = $1::uuid AND m.ward_id = $2::uuid LIMIT 1', [meetingId, wardId]
  );
  if (!meeting.rows[0]) return null;
  if (source === 'published') {
    const render = version
      ? await client.query(`SELECT layout_json, render_data_json, version FROM meeting_program_render
          WHERE meeting_id = $1::uuid AND ward_id = $2::uuid AND version = $3::int
            AND published_at IS NOT NULL AND layout_json IS NOT NULL AND render_data_json IS NOT NULL LIMIT 1`, [meetingId, wardId, version])
      : await client.query(`SELECT r.layout_json, r.render_data_json, r.version
          FROM public_program_share s
          JOIN meeting_program_render r ON r.id = s.active_render_id
            AND r.ward_id = s.ward_id AND r.meeting_id = s.meeting_id
          WHERE s.ward_id = $1::uuid AND s.meeting_id = $2::uuid
            AND s.active_render_id IS NOT NULL
            AND (s.expires_at IS NULL OR s.expires_at > now())
            AND r.published_at IS NOT NULL AND r.layout_json IS NOT NULL AND r.render_data_json IS NOT NULL
          LIMIT 1`, [meetingId, wardId]);
    const row = render.rows[0] as { layout_json: unknown; render_data_json: ResolvedDocumentData; version: number } | undefined;
    if (!row?.layout_json || !row.render_data_json) return null;
    const layout = (row.layout_json as { schemaVersion?: unknown }).schemaVersion === 2 ? downgradeToV1(parseAdvancedLayout(row.layout_json)) : row.layout_json as DocumentLayout;
    return { layout, data: { ...row.render_data_json, media: await hydrateMedia(client, wardId, row.render_data_json.media) }, wardName: meeting.rows[0].ward_name, publishedVersion: row.version };
  }

  const document = await client.query('SELECT layout_json FROM meeting_document WHERE meeting_id = $1::uuid AND ward_id = $2::uuid AND document_type = \'SACRAMENT_PROGRAM\' LIMIT 1', [meetingId, wardId]);
  if (!document.rows[0]) return null;
  const items = await client.query('SELECT item_type, title, topic, hymn_title, sequence FROM meeting_program_item WHERE meeting_id = $1::uuid AND ward_id = $2::uuid ORDER BY sequence ASC', [meetingId, wardId]);
  const media = await client.query('SELECT id, alt_text, is_decorative, public_token FROM media_asset WHERE status = \'ACTIVE\' AND (scope_type = \'SYSTEM\' OR (scope_type = \'WARD\' AND ward_id = $1::uuid) OR (scope_type = \'STAKE\' AND stake_id = (SELECT stake_id FROM ward WHERE id = $1::uuid)))', [wardId]);
  const sourceData = {
    meetingDate: String(meeting.rows[0].meeting_date), meetingType: meeting.rows[0].meeting_type, wardName: meeting.rows[0].ward_name, location: meeting.rows[0].location,
    programItems: (items.rows as Array<{ item_type: string; title: string | null; topic: string | null; hymn_title: string | null; sequence: number }>).map((item) => ({ order: item.sequence, label: item.title ?? item.hymn_title ?? item.item_type, details: item.topic })),
    media: Object.fromEntries((media.rows as Array<{ id: string; alt_text: string | null; is_decorative: boolean; public_token: string }>).map((item) => [item.id, { url: `/media/${encodeURIComponent(item.public_token)}`, altText: item.alt_text, isDecorative: item.is_decorative }])),
  };
  const input = document.rows[0].layout_json;
  const { layout, data } = resolveDocumentData(input, sourceData, { target: 'PRINT' });
  return { layout, data: { ...data, media: await hydrateMedia(client, wardId, data.media) }, wardName: meeting.rows[0].ward_name, publishedVersion: null };
}
