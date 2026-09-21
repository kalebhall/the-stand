import { randomUUID } from 'node:crypto';
import type { Queryable } from './persistence';
import { createStorageKey, readMedia, writeMedia, deleteMedia } from './media-storage';
import { validateAndNormalizeImage, validateMediaMetadata } from './media-validation';
import type { MediaAsset, MediaAssetResponse, MediaMimeType } from './media-types';

export type MediaServiceErrorCode = 'MEDIA_NOT_FOUND' | 'MEDIA_REFERENCED' | 'MEDIA_FORBIDDEN' | 'MEDIA_STORAGE_UNAVAILABLE';
export class MediaServiceError extends Error { constructor(public readonly code: MediaServiceErrorCode, message: string) { super(message); } }

function extension(mime: MediaMimeType): 'jpg' | 'png' | 'webp' { return mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp'; }
function response(row: MediaAsset, publicBase = '/media'): MediaAssetResponse {
  return { ...row, url: row.public_token ? `${publicBase}/${encodeURIComponent(row.public_token)}` : null };
}

export async function listReadableMedia(client: Queryable, wardId: string): Promise<MediaAssetResponse[]> {
  const result = await client.query(`
    SELECT m.id, m.scope_type, m.ward_id, m.stake_id, m.owner_user_id, m.storage_key, m.public_token,
           m.filename, m.mime_type, m.byte_size, m.pixel_width, m.pixel_height, m.alt_text,
           m.is_decorative, m.status, m.created_by_user_id, m.created_at, m.updated_at
      FROM media_asset m
     WHERE m.status = 'ACTIVE'
       AND (m.scope_type = 'SYSTEM' OR m.ward_id = $1::uuid OR m.stake_id = (SELECT stake_id FROM ward WHERE id = $1::uuid))
     ORDER BY m.created_at DESC`, [wardId]);
  return (result.rows as unknown as MediaAsset[]).map((row) => response(row));
}

export async function createWardMedia(client: Queryable, input: {
  wardId: string; userId: string; filename: string; declaredMimeType?: string | null; buffer: Buffer;
  altText?: string | null; isDecorative?: boolean;
}): Promise<MediaAssetResponse> {
  const normalized = await validateAndNormalizeImage({ buffer: input.buffer, declaredMimeType: input.declaredMimeType });
  const metadata = validateMediaMetadata(input);
  const storageKey = createStorageKey(extension(normalized.mimeType));
  const publicToken = randomUUID();
  await writeMedia(storageKey, normalized.buffer);
  try {
    const result = await client.query(`
      INSERT INTO media_asset (
        scope_type, ward_id, owner_user_id, filename, storage_key, public_token, mime_type,
        byte_size, pixel_width, pixel_height, alt_text, is_decorative, status, created_by_user_id
      ) VALUES ('WARD', $1::uuid, $2::uuid, $3::text, $4::text, $5::text, $6::text,
                $7::int, $8::int, $9::int, $10::text, $11::boolean, 'ACTIVE', $2::uuid)
      RETURNING id, scope_type, ward_id, stake_id, owner_user_id, storage_key, public_token, filename,
                mime_type, byte_size, pixel_width, pixel_height, alt_text, is_decorative, status,
                created_by_user_id, created_at, updated_at`,
      [input.wardId, input.userId, input.filename.trim().slice(0, 255), storageKey, publicToken, normalized.mimeType,
        normalized.byteSize, normalized.width, normalized.height, metadata.altText, metadata.isDecorative]);
    if (!result.rows[0]) throw new Error('Media insert returned no row');
    return response(result.rows[0] as unknown as MediaAsset);
  } catch (error) {
    await deleteMedia(storageKey).catch(() => undefined);
    throw error;
  }
}

export async function loadMediaForPublicToken(client: Queryable, token: string): Promise<MediaAsset | null> {
  const result = await client.query(`SELECT * FROM public.lookup_public_media_asset($1::text)`, [token]);
  return (result.rows[0] as unknown as MediaAsset | undefined) ?? null;
}

export async function reconcileMediaStorage(client: Queryable, wardId: string): Promise<{ missing: Array<{ id: string; storageKey: string }> }> {
  // Caller must use a maintenance transaction with the authenticated ward context.
  const context = await client.query(`SELECT app.current_ward_id() AS ward_id`);
  if (context.rows[0]?.ward_id !== wardId) throw new MediaServiceError('MEDIA_FORBIDDEN', 'Media reconciliation ward context mismatch.');
  const result = await client.query(`SELECT id, storage_key FROM media_asset WHERE status = 'ACTIVE' AND ward_id = $1::uuid`, [wardId]);
  const missing: Array<{ id: string; storageKey: string }> = [];
  for (const row of result.rows as Array<{ id: string; storage_key: string }>) {
    try { await readMedia(row.storage_key); }
    catch { missing.push({ id: row.id, storageKey: row.storage_key }); }
  }
  return { missing };
}

export async function archiveWardMedia(client: Queryable, wardId: string, assetId: string): Promise<void> {
  const result = await client.query(`SELECT * FROM public.media_asset_archive($1::uuid, $2::uuid)`, [wardId, assetId]);
  if (result.rows[0]) return;
  await client.query('LOCK TABLE meeting_document, meeting_program_render IN SHARE MODE');
  const referenced = await client.query(`
    SELECT 1 FROM media_asset m
     WHERE m.id = $1::uuid AND m.ward_id = $2::uuid AND m.status = 'ACTIVE'
       AND (EXISTS (SELECT 1 FROM meeting_document md WHERE md.ward_id = m.ward_id AND md.layout_json::text LIKE ('%' || m.id::text || '%'))
         OR EXISTS (SELECT 1 FROM meeting_program_render r WHERE r.ward_id = m.ward_id AND r.render_html LIKE ('%' || m.public_token || '%')))
     LIMIT 1`, [assetId, wardId]);
  if (referenced.rows[0]) throw new MediaServiceError('MEDIA_REFERENCED', 'Media asset is referenced by a document or published program.');
  throw new MediaServiceError('MEDIA_NOT_FOUND', 'Media asset was not found.');
}
