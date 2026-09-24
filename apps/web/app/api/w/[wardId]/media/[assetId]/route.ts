import { NextResponse } from 'next/server';
import { auth } from '@/src/auth/auth';
import { recordAuditEvent } from '@/src/audit/service';
import { canDeleteProgramMedia, canViewMeetings, canViewProgramDesigner } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { isWardModuleEnabled } from '@/src/modules/service';
import { archiveWardMedia, MediaServiceError } from '@/src/document-designer/media-service';
import { readMedia } from '@/src/document-designer/media-storage';

export async function GET(_: Request, context: { params: Promise<{ wardId: string; assetId: string }> }) {
  const session = await auth();
  const { wardId, assetId } = await context.params;
  if (!session?.user?.id || session.activeWardId !== wardId) return new NextResponse(null, { status: 404 });
  const canReadMedia = canViewMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)
    || canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId);
  if (!canReadMedia) return new NextResponse(null, { status: 404 });
  if (!(await isWardModuleEnabled(wardId, session.user.id, 'programs'))) return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const result = await client.query(
      `SELECT m.storage_key, m.mime_type, m.alt_text, m.is_decorative
         FROM media_asset m
        WHERE m.id = $1::uuid
          AND m.status = 'ACTIVE'
          AND (m.scope_type = 'SYSTEM' OR m.ward_id = $2::uuid OR m.stake_id = (SELECT stake_id FROM ward WHERE id = $2::uuid))
        LIMIT 1`,
      [assetId, wardId]
    );
    const asset = result.rows[0] as { storage_key: string; mime_type: string; alt_text: string | null; is_decorative: boolean } | undefined;
    if (!asset || (!asset.is_decorative && !asset.alt_text)) {
      await client.query('ROLLBACK');
      return new NextResponse(null, { status: 404 });
    }
    const body = await readMedia(asset.storage_key).catch(() => null);
    if (!body) {
      await client.query('ROLLBACK');
      return new NextResponse(null, { status: 404 });
    }
    await client.query('COMMIT');
    return new NextResponse(body as unknown as BodyInit, {
      status: 200,
      headers: { 'Content-Type': asset.mime_type, 'Content-Length': String(body.byteLength), 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' }
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[media-authenticated] delivery failed', { wardId, assetId, error });
    return new NextResponse(null, { status: 404 });
  } finally {
    client.release();
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ wardId: string; assetId: string }> }) {
  const session = await auth();
  const { wardId, assetId } = await context.params;
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  if (!(await isWardModuleEnabled(wardId, session.user.id, 'programs'))) return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const settings = await client.query('SELECT allow_program_editor_delete_media FROM ward_document_settings WHERE ward_id = $1::uuid LIMIT 1', [wardId]);
    const profile = { allowProgramEditorDeleteMedia: settings.rows[0]?.allow_program_editor_delete_media === true };
    if (!canDeleteProgramMedia({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId, profile)) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }
    await archiveWardMedia(client, wardId, assetId);
    await recordAuditEvent(client, {
      wardId,
      userId: session.user.id,
      actorName: session.user.name || session.user.email || null,
      actorRole: session.user.roles?.[0] || null,
      action: 'MEDIA_ARCHIVED',
      entityType: 'media_asset',
      entityId: assetId,
      details: { status: 'ARCHIVED' },
      source: 'api',
      severity: 'notice'
    });
    await client.query('COMMIT');
    return NextResponse.json({ archived: true });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    const serviceCode = error instanceof MediaServiceError ? error.code : 'INTERNAL_ERROR';
    const databaseCode = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : null;
    const code = databaseCode === '42501' ? 'FORBIDDEN' : serviceCode === 'MEDIA_REFERENCED' ? 'MEDIA_REFERENCED' : serviceCode === 'MEDIA_NOT_FOUND' ? 'NOT_FOUND' : 'INTERNAL_ERROR';
    const status = code === 'FORBIDDEN' ? 403 : code === 'MEDIA_REFERENCED' ? 409 : code === 'NOT_FOUND' ? 404 : 500;
    return NextResponse.json({ error: code === 'FORBIDDEN' ? 'Forbidden' : code === 'MEDIA_REFERENCED' ? 'Media asset is referenced by a document or published program' : code === 'NOT_FOUND' ? 'Media asset was not found' : 'Unable to archive media', code }, { status });
  } finally { client.release(); }
}
