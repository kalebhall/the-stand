import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import https from 'node:https';
import type { PoolClient } from 'pg';

import { isAdvancedLayout, parseAdvancedLayout, projectAdvancedLayoutForOutput } from './advanced-schema';
import { resolveDocumentData } from './data-resolver';
import { readMedia } from './media-storage';
import type { ResolvedDocumentData } from './render-types';
import type { DocumentLayout } from './types';
import type { AdvancedDocumentLayout } from './advanced-schema';
import { buildPublicPreviewSource } from '@/src/document-designer/meeting-document-service';
import { adaptLegacyLayoutToAdvancedDocument, LEGACY_COVER_ASSET_ID } from './legacy-layout-adapter';
import type { IntroductionRoles } from '@/src/meetings/types';

type PrintSource = 'draft' | 'published';

type StoredMedia = { storage_key: string; mime_type: string };

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const octets = address.split('.').map(Number);
    return (
      octets[0] === 0 ||
      octets[0] === 10 ||
      (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) ||
      octets[0] === 127 ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && (octets[1] === 0 || octets[1] === 168)) ||
      (octets[0] === 192 && octets[1] === 88 && octets[2] === 99) ||
      (octets[0] === 198 && (octets[1] === 18 || octets[1] === 19 || octets[1] === 51)) ||
      (octets[0] === 203 && octets[1] === 0 && octets[2] === 113) ||
      octets[0] >= 224
    );
  }
  const normalized = address.toLowerCase();
  const groups = normalized.split('::');
  const left = groups[0] ? groups[0].split(':').filter(Boolean) : [];
  const right = groups[1] ? groups[1].split(':').filter(Boolean) : [];
  const expanded = [...left, ...Array(8 - left.length - right.length).fill('0'), ...right].map((group) => group.padStart(4, '0'));
  if (expanded.length !== 8) return true;
  const first = Number.parseInt(expanded[0], 16);
  const mapped = expanded.slice(0, 5).every((group) => group === '0000') && expanded[5] === 'ffff';
  if (mapped) {
    const mappedAddress = expanded.slice(6).map((group) => Number.parseInt(group, 16));
    return isPrivateAddress(`${mappedAddress[0] >> 8}.${mappedAddress[0] & 255}.${mappedAddress[1] >> 8}.${mappedAddress[1] & 255}`);
  }
  return (
    first < 0x2000 ||
    first >= 0x4000 ||
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xff00) === 0xfe00 ||
    first === 0xff00 ||
    normalized.startsWith('2001:0db8:')
  );
}

const MAX_EXTERNAL_IMAGE_BYTES = 10 * 1024 * 1024;

async function fetchPinnedImage(parsed: URL, address: string): Promise<{ contentType: string; bytes: Buffer } | null> {
  return new Promise((resolve, reject) => {
    const lookupAddress: NonNullable<https.RequestOptions['lookup']> = (_hostname, _options, callback) => {
      callback(null, address, isIP(address));
    };
    const request = https.get(
      {
        hostname: address,
        port: parsed.port || 443,
        path: `${parsed.pathname}${parsed.search}`,
        servername: parsed.hostname,
        headers: { accept: 'image/jpeg,image/png,image/webp', host: parsed.host },
        lookup: lookupAddress
      },
      (response) => {
        const contentType = response.headers['content-type']?.split(';', 1)[0]?.toLowerCase();
        const contentLength = Number(response.headers['content-length'] ?? 0);
        if (
          response.statusCode !== 200 ||
          !contentType ||
          !['image/jpeg', 'image/png', 'image/webp'].includes(contentType) ||
          contentLength > MAX_EXTERNAL_IMAGE_BYTES
        ) {
          response.resume();
          reject(new Error('Invalid external image response'));
          return;
        }
        const chunks: Buffer[] = [];
        let total = 0;
        response.on('data', (chunk: Buffer) => {
          total += chunk.byteLength;
          if (total > MAX_EXTERNAL_IMAGE_BYTES) {
            request.destroy(new Error('External image exceeds size limit'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => resolve({ contentType, bytes: Buffer.concat(chunks) }));
        response.on('error', reject);
      }
    );
    request.setTimeout(5000, () => request.destroy(new Error('External image request timed out')));
    request.on('error', reject);
  });
}

async function externalImageToDataUrl(url: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.hostname === 'localhost' ||
    parsed.hostname.endsWith('.local')
  )
    return null;
  try {
    const addresses = await lookup(parsed.hostname, { all: true, verbatim: true });
    const address = addresses.find(({ address: candidate }) => !isPrivateAddress(candidate))?.address;
    if (!address) return null;
    const response = await fetchPinnedImage(parsed, address);
    return response ? `data:${response.contentType};base64,${response.bytes.toString('base64')}` : null;
  } catch {
    return null;
  }
}

async function toDataUrl(client: PoolClient, wardId: string, url: string): Promise<string | null> {
  const assetId = url.match(/\/api\/w\/[^/]+\/media\/([^/?#]+)/)?.[1];
  const token = url.match(/(?:^|\/)media\/([^/?#]+)/)?.[1];
  const result =
    assetId || token
      ? await client.query(
          `SELECT storage_key, mime_type FROM media_asset
        WHERE ${assetId ? 'id = $1::uuid' : 'public_token = $1::text'} AND status = 'ACTIVE'
          AND (scope_type = 'SYSTEM'
            OR (scope_type = 'WARD' AND ward_id = $2::uuid)
            OR (scope_type = 'STAKE' AND stake_id = (SELECT stake_id FROM ward WHERE id = $2::uuid)))
        LIMIT 1`,
          [decodeURIComponent(assetId ?? token ?? ''), wardId]
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

async function hydrateMedia(
  client: PoolClient,
  wardId: string,
  media: ResolvedDocumentData['media']
): Promise<ResolvedDocumentData['media']> {
  if (!media) return media;
  const hydrated: NonNullable<ResolvedDocumentData['media']> = {};
  for (const [assetId, asset] of Object.entries(media)) {
    if (!asset) continue;
    const url = asset.url.startsWith('data:image/')
      ? asset.url
      : /^https?:\/\//.test(asset.url)
        ? await externalImageToDataUrl(asset.url)
        : await toDataUrl(client, wardId, asset.url);
    if (url) hydrated[assetId] = { ...asset, url };
  }
  return hydrated;
}

export async function loadPrintDocument(
  client: PoolClient,
  wardId: string,
  meetingId: string,
  source: PrintSource,
  version: number | null,
  options: { advancedProjection?: boolean } = {}
): Promise<{
  layout: DocumentLayout | AdvancedDocumentLayout;
  data: ResolvedDocumentData;
  wardName: string;
  publishedVersion: number | null;
} | null> {
  const meeting = await client.query(
    'SELECT w.name AS ward_name, w.default_locale, m.meeting_date, m.meeting_type, m.location FROM meeting m JOIN ward w ON w.id = m.ward_id WHERE m.id = $1::uuid AND m.ward_id = $2::uuid LIMIT 1',
    [meetingId, wardId]
  );
  if (!meeting.rows[0]) return null;
  if (source === 'published') {
    const render = version
      ? await client.query(
          `SELECT layout_json, render_data_json, version FROM meeting_program_render
          WHERE meeting_id = $1::uuid AND ward_id = $2::uuid AND version = $3::int
            AND published_at IS NOT NULL AND layout_json IS NOT NULL AND render_data_json IS NOT NULL LIMIT 1`,
          [meetingId, wardId, version]
        )
      : await client.query(
          `SELECT r.layout_json, r.render_data_json, r.version
          FROM public_program_share s
          JOIN meeting_program_render r ON r.id = s.active_render_id
            AND r.ward_id = s.ward_id AND r.meeting_id = s.meeting_id
          WHERE s.ward_id = $1::uuid AND s.meeting_id = $2::uuid
            AND s.active_render_id IS NOT NULL
            AND (s.expires_at IS NULL OR s.expires_at > now())
            AND r.published_at IS NOT NULL AND r.layout_json IS NOT NULL AND r.render_data_json IS NOT NULL
          LIMIT 1`,
          [meetingId, wardId]
        );
    const row = render.rows[0] as { layout_json: unknown; render_data_json: ResolvedDocumentData; version: number } | undefined;
    if (!row?.layout_json || !row.render_data_json) return null;
    const data = { ...row.render_data_json, media: await hydrateMedia(client, wardId, row.render_data_json.media) };
    const layout =
      options.advancedProjection === false
        ? resolveDocumentData(
            row.layout_json,
            {
              meetingDate: String(meeting.rows[0].meeting_date),
              meetingType: meeting.rows[0].meeting_type,
              wardName: meeting.rows[0].ward_name,
              programItems: data.meetingItems
            },
            { target: 'PRINT', advancedProjection: false }
          ).layout
        : isAdvancedLayout(row.layout_json)
          ? projectAdvancedLayoutForOutput(parseAdvancedLayout(row.layout_json), 'PRINT', data)
          : (row.layout_json as DocumentLayout);
    return { layout, data, wardName: meeting.rows[0].ward_name, publishedVersion: row.version };
  }

  const document = await client.query(
    "SELECT layout_json FROM meeting_document WHERE meeting_id = $1::uuid AND ward_id = $2::uuid AND document_type = 'SACRAMENT_PROGRAM' LIMIT 1",
    [meetingId, wardId]
  );
  const legacyResult = document.rows[0]
    ? { rows: [] }
    : await client.query(
        'SELECT preset, announcement_mode, cover_mode, cover_image_url, cover_image_alt_text FROM public_program_layout WHERE ward_id = $1::uuid LIMIT 1',
        [wardId]
      );
  const legacy = legacyResult.rows[0] as
    | {
        preset: 'SINGLE_SHEET_BIFOLD' | 'TRI_FOLD_BULLETIN' | 'FULL_PAGE';
        announcement_mode: 'NONE' | 'AFTER_PROGRAM' | 'BACK_PANEL';
        cover_mode: 'NONE' | 'AUTHORIZED_IMAGE';
        cover_image_url: string | null;
        cover_image_alt_text: string | null;
      }
    | undefined;
  if (!document.rows[0] && !legacy) return null;
  const items = await client.query(
    'SELECT item_type, title, topic, program_notes, hymn_number, hymn_title, sequence, introduction_roles FROM meeting_program_item WHERE meeting_id = $1::uuid AND ward_id = $2::uuid ORDER BY sequence ASC',
    [meetingId, wardId]
  );
  const announcements = await client.query(
    `SELECT title
       FROM announcement
      WHERE ward_id = $1::uuid
        AND include_in_program = TRUE
        AND (is_permanent = TRUE OR ((start_date IS NULL OR start_date <= $2::date) AND (end_date IS NULL OR end_date >= $2::date)))
      ORDER BY created_at DESC`,
    [wardId, meeting.rows[0].meeting_date]
  );
  const media = await client.query(
    "SELECT id, alt_text, is_decorative, public_token FROM media_asset WHERE status = 'ACTIVE' AND (scope_type = 'SYSTEM' OR (scope_type = 'WARD' AND ward_id = $1::uuid) OR (scope_type = 'STAKE' AND stake_id = (SELECT stake_id FROM ward WHERE id = $1::uuid)))",
    [wardId]
  );
  const publicSource = buildPublicPreviewSource(
    {
      meetingDate: String(meeting.rows[0].meeting_date),
      meetingType: meeting.rows[0].meeting_type,
      wardName: meeting.rows[0].ward_name,
      locale: meeting.rows[0].default_locale
    },
    (
      items.rows as Array<{
        item_type: string;
        title: string | null;
        topic: string | null;
        program_notes: string | null;
        hymn_number: string | null;
        hymn_title: string | null;
        sequence: number;
        introduction_roles: IntroductionRoles | null;
      }>
    ).map((item) => ({
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
  const sourceData = {
    ...publicSource,
    location: meeting.rows[0].location,
    media: {
      ...Object.fromEntries(
        (media.rows as Array<{ id: string; alt_text: string | null; is_decorative: boolean }>).map((item) => [
          item.id,
          {
            url: `/api/w/${encodeURIComponent(wardId)}/media/${encodeURIComponent(item.id)}`,
            altText: item.alt_text,
            isDecorative: item.is_decorative
          }
        ])
      ),
      ...(!document.rows[0] && legacy?.cover_mode === 'AUTHORIZED_IMAGE' && legacy.cover_image_url
        ? { [LEGACY_COVER_ASSET_ID]: { url: legacy.cover_image_url, altText: legacy.cover_image_alt_text, isDecorative: false } }
        : {})
    }
  };
  const input =
    document.rows[0]?.layout_json ??
    adaptLegacyLayoutToAdvancedDocument({
      preset: legacy?.preset ?? 'FULL_PAGE',
      announcementMode: legacy?.announcement_mode ?? 'AFTER_PROGRAM',
      coverMode: legacy?.cover_mode ?? 'NONE',
      coverImageUrl: legacy?.cover_image_url ?? null,
      coverImageAltText: legacy?.cover_image_alt_text ?? null
    });
  const { layout, data } = resolveDocumentData(input, sourceData, { target: 'PRINT', advancedProjection: options.advancedProjection });
  const hydratedData = { ...data, media: await hydrateMedia(client, wardId, data.media) };
  const advancedLayout =
    options.advancedProjection === false
      ? null
      : isAdvancedLayout(input)
        ? projectAdvancedLayoutForOutput(parseAdvancedLayout(input), 'PRINT', hydratedData)
        : layout.fold !== 'NONE'
          ? projectAdvancedLayoutForOutput(parseAdvancedLayout(input), 'PRINT', hydratedData)
          : null;
  return { layout: advancedLayout ?? layout, data: hydratedData, wardName: meeting.rows[0].ward_name, publishedVersion: null };
}
