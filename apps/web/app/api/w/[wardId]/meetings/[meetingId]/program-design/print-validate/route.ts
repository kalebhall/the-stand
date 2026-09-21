import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canViewProgramDesigner } from '@/src/auth/roles';
import { loadPrintDocument } from '@/src/document-designer/print-data';
import { validatePrintLayout } from '@/src/document-designer/overflow';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

function errorResponse(error: string, code: string, status: number) { return NextResponse.json({ error, code }, { status }); }

export async function POST(request: Request, context: { params: Promise<{ wardId: string; meetingId: string }> }) {
  const session = await auth();
  const { wardId, meetingId } = await context.params;
  if (!session?.user?.id) return errorResponse('Unauthorized', 'UNAUTHORIZED', 401);
  if (!canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) return errorResponse('Forbidden', 'FORBIDDEN', 403);
  const parsed = await request.json().catch(() => null) as unknown;
  const body = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as { source?: unknown; version?: unknown }
    : {};
  if (body.source !== undefined && body.source !== 'draft' && body.source !== 'published') return errorResponse('Invalid print source', 'BAD_REQUEST', 400);
  if (body.version !== undefined && body.version !== null && (!Number.isInteger(body.version) || Number(body.version) < 1)) return errorResponse('Invalid published version', 'BAD_REQUEST', 400);
  const source = body.source === 'published' ? 'published' : 'draft';
  const version = body.version == null ? null : Number(body.version);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const loaded = await loadPrintDocument(client, wardId, meetingId, source, version);
    if (!loaded) { await client.query('ROLLBACK'); return errorResponse(source === 'published' ? 'Published print inputs are unavailable for this version' : 'Meeting document not found', source === 'published' ? 'PUBLISHED_INPUTS_UNAVAILABLE' : 'NOT_FOUND', source === 'published' ? 409 : 404); }
    const validation = validatePrintLayout(loaded.layout, loaded.data);
    await client.query('COMMIT');
    return NextResponse.json({ ...validation, source, publishedVersion: loaded.publishedVersion });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[print-validate] failed', error);
    return errorResponse('Failed to validate print layout', 'INTERNAL_ERROR', 500);
  } finally { client.release(); }
}
