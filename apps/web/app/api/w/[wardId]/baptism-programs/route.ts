import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canEditProgramDesign, canViewProgramDesigner } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { isWardModuleEnabled } from '@/src/modules/service';
import { baptismProgramAdapter, baptismProgramSourceSchema, type BaptismProgramPayload, type BaptismProgramSource } from '@/src/programs/baptism-adapter';
import { saveBaptismProgramDocument } from '@/src/programs/baptism-persistence';

const createSchema = baptismProgramSourceSchema.omit({ wardId: true, eventId: true, eventVersion: true });

function errorResponse(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status });
}

type AuthorizedSession = { user: { id: string; roles: string[] }; activeWardId: string };
type AuthorizationResult = { response: NextResponse } | { session: AuthorizedSession };

async function programsEnabled(client: Awaited<ReturnType<typeof pool.connect>>, wardId: string): Promise<boolean> {
  await client.query('LOCK TABLE ward_module_enablement IN SHARE MODE');
  const result = await client.query(
    `SELECT enabled FROM ward_module_enablement
      WHERE ward_id = $1::uuid AND module_id = 'programs'
      LIMIT 1`,
    [wardId]
  );
  return result.rows[0]?.enabled !== false;
}

function safeSource(value: unknown, sourceId: string, sourceVersion: string | null): Pick<BaptismProgramSource, 'eventId' | 'eventVersion' | 'date' | 'title' | 'location' | 'participantDisplayName' | 'programItems'> | null {
  const parsed = baptismProgramSourceSchema.strip().safeParse(value);
  if (!parsed.success) return null;
  if (parsed.data.eventId !== sourceId || (parsed.data.eventVersion ?? null) !== sourceVersion) return null;
  const { eventId, eventVersion, date, title, location, participantDisplayName, programItems } = parsed.data;
  return { eventId, eventVersion, date, title, location, participantDisplayName, programItems };
}

function projectPersistedProgram(program: Record<string, unknown>) {
  return {
    id: program.id,
    programType: program.programType,
    source: program.source,
    schemaVersion: program.schemaVersion,
    metadata: program.metadata,
    payload: program.payload,
    revision: program.revision,
    updatedAt: program.updatedAt
  };
}

async function authorize(wardId: string, mode: 'view' | 'edit'): Promise<AuthorizationResult> {
  const session = await auth();
  if (!session?.user?.id) return { response: errorResponse('Unauthorized', 'UNAUTHORIZED', 401) as NextResponse };
  if (session.activeWardId !== wardId) return { response: errorResponse('Forbidden', 'FORBIDDEN', 403) as NextResponse };
  const allowed = mode === 'edit'
    ? canEditProgramDesign({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)
    : canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId);
  if (!allowed || !(await isWardModuleEnabled(wardId, session.user.id, 'programs'))) return { response: errorResponse('Forbidden', 'FORBIDDEN', 403) as NextResponse };
  return { session: session as AuthorizedSession };
}

export async function GET(request: Request, context: { params: Promise<{ wardId: string }> }) {
  void request;
  const { wardId } = await context.params;
  const authorization = await authorize(wardId, 'view');
  if ('response' in authorization) return authorization.response;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: authorization.session.user.id, wardId });
    if (!(await programsEnabled(client, wardId))) { await client.query('ROLLBACK'); return errorResponse('Programs is disabled for this ward', 'FEATURE_DISABLED', 404); }
    const result = await client.query(
      `SELECT s.source_id, s.source_version, s.source_json, d.revision, d.updated_at
         FROM program_source_event s
         LEFT JOIN program_document d
           ON d.ward_id = s.ward_id AND d.program_type = 'BAPTISM_PROGRAM'
          AND d.source_type = s.source_type AND d.source_id = s.source_id
          AND d.source_version = s.source_version
        WHERE s.ward_id = $1::uuid AND s.source_type = 'BAPTISM_EVENT'
        ORDER BY (s.source_json->>'date')::text ASC, s.created_at ASC`,
      [wardId]
    );
    await client.query('COMMIT');
    return NextResponse.json({ programs: result.rows.flatMap((row) => {
      const source = safeSource(row.source_json, String(row.source_id), row.source_version == null ? null : String(row.source_version));
      if (!source) return [];
      return [{
        eventId: String(row.source_id),
        eventVersion: row.source_version == null ? null : String(row.source_version),
        source,
        revision: row.revision == null ? null : Number(row.revision),
        updatedAt: row.updated_at ?? null
      }];
    }) });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return errorResponse('Failed to load baptism programs', 'INTERNAL_ERROR', 500);
  } finally {
    client.release();
  }
}

export async function POST(request: Request, context: { params: Promise<{ wardId: string }> }) {
  const { wardId } = await context.params;
  const authorization = await authorize(wardId, 'edit');
  if ('response' in authorization) return authorization.response;
  const body = createSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return errorResponse('Invalid baptism program payload', 'BAD_REQUEST', 400);

  const source: BaptismProgramSource = {
    ...body.data,
    wardId,
    eventId: crypto.randomUUID(),
    eventVersion: '1'
  };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: authorization.session.user.id, wardId });
    if (!(await programsEnabled(client, wardId))) { await client.query('ROLLBACK'); return errorResponse('Programs is disabled for this ward', 'FEATURE_DISABLED', 404); }
    const parsedSource = baptismProgramSourceSchema.parse(source);
    await client.query(
      `INSERT INTO program_source_event (ward_id, source_type, source_id, source_version, source_json)
       VALUES ($1::uuid, 'BAPTISM_EVENT', $2::text, $3::text, $4::jsonb)`,
      [wardId, parsedSource.eventId, parsedSource.eventVersion, JSON.stringify(parsedSource)]
    );
    const document = baptismProgramAdapter.toDocument(parsedSource, {
      template: 'STANDARD_BAPTISM',
      participantDisplayName: parsedSource.participantDisplayName,
      items: parsedSource.programItems
    }) as import('@/src/programs/contracts').ProgramDocument<BaptismProgramPayload>;
    const saved = await saveBaptismProgramDocument(client, { wardId, document });
    if (!saved) {
      await client.query('ROLLBACK');
      return errorResponse('Baptism source could not be saved', 'SOURCE_CONFLICT', 409);
    }
    await client.query('COMMIT');
    return NextResponse.json({ program: projectPersistedProgram(saved as unknown as Record<string, unknown>) }, { status: 201 });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return errorResponse('Failed to create baptism program', 'INTERNAL_ERROR', 500);
  } finally {
    client.release();
  }
}
