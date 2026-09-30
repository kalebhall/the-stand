import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canEditProgramDesign, canViewProgramDesigner } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { isWardModuleEnabled } from '@/src/modules/service';
import { baptismProgramAdapter, baptismProgramSourceSchema, type BaptismProgramPayload, type BaptismProgramSource } from '@/src/programs/baptism-adapter';
import { loadBaptismProgramDocument, saveBaptismProgramDocument } from '@/src/programs/baptism-persistence';

const editableSourceSchema = baptismProgramSourceSchema.pick({ date: true, title: true, location: true, participantDisplayName: true, programItems: true });

type Session = { user: { id: string; roles: string[] }; activeWardId: string };

function errorResponse(error: string, code: string, status: number) { return NextResponse.json({ error, code }, { status }); }

function publicDocument(document: Awaited<ReturnType<typeof loadBaptismProgramDocument>>) {
  if (!document) return null;
  return {
    id: document.id,
    programType: document.programType,
    source: document.source,
    schemaVersion: document.schemaVersion,
    metadata: document.metadata,
    payload: document.payload,
    revision: document.revision,
    updatedAt: document.updatedAt
  };
}

async function authorize(wardId: string, mode: 'view' | 'edit') {
  const session = await auth();
  if (!session?.user?.id || session.activeWardId !== wardId) return null;
  const allowed = mode === 'edit'
    ? canEditProgramDesign({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)
    : canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId);
  if (!allowed || !(await isWardModuleEnabled(wardId, session.user.id, 'programs'))) return null;
  return session as Session;
}

async function moduleEnabled(client: Awaited<ReturnType<typeof pool.connect>>, wardId: string) {
  await client.query('LOCK TABLE ward_module_enablement IN SHARE MODE');
  const result = await client.query(`SELECT enabled FROM ward_module_enablement WHERE ward_id = $1::uuid AND module_id = 'programs' LIMIT 1`, [wardId]);
  return result.rows[0]?.enabled === true;
}

export async function GET(_: Request, context: { params: Promise<{ wardId: string; eventId: string }> }) {
  const { wardId, eventId } = await context.params;
  const session = await authorize(wardId, 'view');
  if (!session) return errorResponse('Forbidden', 'FORBIDDEN', 403);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    if (!(await moduleEnabled(client, wardId))) { await client.query('ROLLBACK'); return errorResponse('Programs is disabled for this ward', 'FEATURE_DISABLED', 404); }
    const result = await client.query(`SELECT source_id, source_version, source_json FROM program_source_event WHERE ward_id = $1::uuid AND source_type = 'BAPTISM_EVENT' AND source_id = $2::text LIMIT 1`, [wardId, eventId]);
    const sourceRow = result.rows[0];
    const source = sourceRow ? baptismProgramSourceSchema.strip().safeParse(sourceRow.source_json) : null;
    if (!source?.success || source.data.eventId !== eventId || source.data.eventVersion !== String(sourceRow.source_version)) { await client.query('ROLLBACK'); return errorResponse('Baptism program not found', 'NOT_FOUND', 404); }
    const document = await loadBaptismProgramDocument(client, { wardId, eventId });
    if (document && document.source.sourceVersion !== String(sourceRow.source_version)) { await client.query('ROLLBACK'); return errorResponse('The baptism program source changed; reload before editing', 'SOURCE_CHANGED', 409); }
    await client.query('COMMIT');
    return NextResponse.json({ source: { date: source.data.date, title: source.data.title, location: source.data.location ?? null, participantDisplayName: source.data.participantDisplayName, programItems: source.data.programItems }, document: publicDocument(document) });
  } catch { await client.query('ROLLBACK').catch(() => undefined); return errorResponse('Failed to load baptism program', 'INTERNAL_ERROR', 500); } finally { client.release(); }
}

export async function PUT(request: Request, context: { params: Promise<{ wardId: string; eventId: string }> }) {
  const { wardId, eventId } = await context.params;
  const session = await authorize(wardId, 'edit');
  if (!session) return errorResponse('Forbidden', 'FORBIDDEN', 403);
  const body = await request.json().catch(() => null) as { expectedRevision?: unknown; source?: unknown } | null;
  const expectedRevision = typeof body?.expectedRevision === 'number' && Number.isInteger(body.expectedRevision) && body.expectedRevision > 0 ? body.expectedRevision : null;
  const parsedBody = editableSourceSchema.safeParse(body?.source);
  if (expectedRevision === null || !parsedBody.success) return errorResponse('Invalid baptism program payload', 'BAD_REQUEST', 400);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    if (!(await moduleEnabled(client, wardId))) { await client.query('ROLLBACK'); return errorResponse('Programs is disabled for this ward', 'FEATURE_DISABLED', 404); }
    const current = await client.query(`SELECT source_version, source_json FROM program_source_event WHERE ward_id = $1::uuid AND source_type = 'BAPTISM_EVENT' AND source_id = $2::text FOR UPDATE`, [wardId, eventId]);
    const row = current.rows[0];
    const currentSource = row ? baptismProgramSourceSchema.strip().safeParse(row.source_json) : null;
    if (!currentSource?.success || currentSource.data.eventId !== eventId) { await client.query('ROLLBACK'); return errorResponse('Baptism program not found', 'NOT_FOUND', 404); }
    const nextVersion = String(Number(row.source_version) + 1);
    const source: BaptismProgramSource = { ...parsedBody.data, wardId, eventId, eventVersion: nextVersion };
    await client.query(`UPDATE program_source_event SET source_version = $3::text, source_json = $4::jsonb, updated_at = now() WHERE ward_id = $1::uuid AND source_type = 'BAPTISM_EVENT' AND source_id = $2::text`, [wardId, eventId, nextVersion, JSON.stringify(source)]);
    const document = baptismProgramAdapter.toDocument(source, { template: 'STANDARD_BAPTISM', participantDisplayName: source.participantDisplayName, items: source.programItems }) as import('@/src/programs/contracts').ProgramDocument<BaptismProgramPayload>;
    const saved = await saveBaptismProgramDocument(client, { wardId, document, expectedRevision });
    if (!saved) { await client.query('ROLLBACK'); return errorResponse('The baptism program changed elsewhere', 'REVISION_CONFLICT', 409); }
    await client.query('COMMIT');
    return NextResponse.json({ document: publicDocument(saved) });
  } catch { await client.query('ROLLBACK').catch(() => undefined); return errorResponse('Failed to save baptism program', 'INTERNAL_ERROR', 500); } finally { client.release(); }
}
