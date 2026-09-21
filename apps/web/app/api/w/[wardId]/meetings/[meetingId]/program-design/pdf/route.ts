import { auth } from '@/src/auth/auth';
import { canViewProgramDesigner } from '@/src/auth/roles';
import { loadPrintDocument } from '@/src/document-designer/print-data';
import { validatePrintLayout } from '@/src/document-designer/overflow';
import { renderDocumentPdf } from '@/src/document-designer/pdf-renderer';
import { pdfResponse, safePdfFilename } from '@/src/document-designer/pdf-download';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { NextResponse } from 'next/server';

function errorResponse(error: string, code: string, status: number) { return NextResponse.json({ error, code }, { status }); }

export async function GET(request: Request, context: { params: Promise<{ wardId: string; meetingId: string }> }) {
  const session = await auth();
  const { wardId, meetingId } = await context.params;
  if (!session?.user?.id) return errorResponse('Unauthorized', 'UNAUTHORIZED', 401);
  if (!canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) return errorResponse('Forbidden', 'FORBIDDEN', 403);
  const params = new URL(request.url).searchParams;
  const source = params.get('source') === 'published' ? 'published' : params.get('source') === 'draft' || !params.has('source') ? 'draft' : null;
  if (!source) return errorResponse('Invalid PDF source', 'BAD_REQUEST', 400);
  const rawVersion = params.get('version');
  const version = rawVersion === null ? null : Number(rawVersion);
  if (rawVersion !== null && (!Number.isInteger(version) || (version as number) < 1)) return errorResponse('Invalid published version', 'BAD_REQUEST', 400);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const loaded = await loadPrintDocument(client, wardId, meetingId, source, version as number | null);
    if (!loaded) { await client.query('ROLLBACK'); return errorResponse(source === 'published' ? 'Published print inputs are unavailable for this version' : 'Meeting document not found', source === 'published' ? 'PUBLISHED_INPUTS_UNAVAILABLE' : 'NOT_FOUND', source === 'published' ? 409 : 404); }
    const validation = validatePrintLayout(loaded.layout, loaded.data);
    if (!validation.valid) { await client.query('ROLLBACK'); return NextResponse.json({ error: 'Print layout cannot be rendered', code: 'PRINT_VALIDATION_FAILED', validation }, { status: 422 }); }
    const doc = await renderDocumentPdf(loaded.layout, loaded.data, { metadata: validation.metadata, title: `${loaded.wardName} Program` });
    const bytes = doc.output('arraybuffer');
    await client.query('COMMIT');
    return pdfResponse(bytes, safePdfFilename(loaded.wardName, source, loaded.publishedVersion ?? undefined));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[program-design-pdf] failed', error);
    return errorResponse('Failed to generate PDF', 'PDF_RENDER_FAILED', 500);
  } finally { client.release(); }
}
