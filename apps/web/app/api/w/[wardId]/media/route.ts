import { NextResponse } from 'next/server';
import { auth } from '@/src/auth/auth';
import { canManageProgramMedia, canViewProgramDesigner } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { isWardModuleEnabled } from '@/src/modules/service';
import { listReadableMedia, createWardMedia } from '@/src/document-designer/media-service';
import { recordAuditEvent } from '@/src/audit/service';

function unauthorized() { return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 }); }
function forbidden() { return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 }); }

export async function GET(_: Request, context: { params: Promise<{ wardId: string }> }) {
  const session = await auth();
  const { wardId } = await context.params;
  if (!session?.user?.id) return unauthorized();
  if (!canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) return forbidden();
  if (!(await isWardModuleEnabled(wardId, session.user.id, 'programs'))) return forbidden();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const media = await listReadableMedia(client, wardId);
    await client.query('COMMIT');
    return NextResponse.json({ media });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return NextResponse.json({ error: 'Unable to load media', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally { client.release(); }
}

export async function POST(request: Request, context: { params: Promise<{ wardId: string }> }) {
  const session = await auth();
  const { wardId } = await context.params;
  if (!session?.user?.id) return unauthorized();
  if (!canManageProgramMedia({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) return forbidden();
  if (!(await isWardModuleEnabled(wardId, session.user.id, 'programs'))) return forbidden();
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Image file is required', code: 'BAD_REQUEST' }, { status: 400 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const media = await createWardMedia(client, {
      wardId, userId: session.user.id, filename: file.name, declaredMimeType: file.type,
      buffer: Buffer.from(await file.arrayBuffer()), altText: String(form?.get('altText') ?? ''), isDecorative: form?.get('isDecorative') === 'true'
    });
    await recordAuditEvent(client, { wardId, userId: session.user.id, action: 'MEDIA_UPLOADED', entityType: 'media_asset', entityId: media.id, details: { filename: media.filename, mimeType: media.mime_type, byteSize: media.byte_size }, source: 'api' });
    await client.query('COMMIT');
    return NextResponse.json({ media }, { status: 201 });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    const code = error instanceof Error && 'code' in error ? String((error as { code: string }).code) : 'INTERNAL_ERROR';
    const status = ['FILE_TOO_LARGE', 'INVALID_IMAGE', 'IMAGE_DIMENSIONS_INVALID', 'UNSUPPORTED_FORMAT', 'MIME_MISMATCH', 'ALT_TEXT_REQUIRED', 'ALT_TEXT_INVALID'].includes(code) ? 400 : 500;
    return NextResponse.json({ error: status === 400 ? (error as Error).message : 'Unable to upload media', code: status === 400 ? code : 'INTERNAL_ERROR' }, { status });
  } finally { client.release(); }
}
