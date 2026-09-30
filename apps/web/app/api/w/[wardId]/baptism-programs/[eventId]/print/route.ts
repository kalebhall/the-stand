import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canViewProgramDesigner } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { isWardModuleEnabled } from '@/src/modules/service';
import { baptismProgramSourceSchema } from '@/src/programs/baptism-adapter';
import { loadBaptismProgramDocument } from '@/src/programs/baptism-persistence';
import { renderBaptismProgram } from '@/src/programs/baptism-renderer';

export async function GET(_: Request, context: { params: Promise<{ wardId: string; eventId: string }> }) {
  const { wardId, eventId } = await context.params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  if (session.activeWardId !== wardId || !canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  if (!(await isWardModuleEnabled(wardId, session.user.id, 'programs'))) return NextResponse.json({ error: 'Programs is disabled for this ward', code: 'FEATURE_DISABLED' }, { status: 404 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    await client.query('LOCK TABLE ward_module_enablement IN SHARE MODE');
    const enabled = await client.query(`SELECT enabled FROM ward_module_enablement WHERE ward_id = $1::uuid AND module_id = 'programs' LIMIT 1`, [wardId]);
    if (enabled.rows[0]?.enabled !== true) { await client.query('ROLLBACK'); return NextResponse.json({ error: 'Programs is disabled for this ward', code: 'FEATURE_DISABLED' }, { status: 404 }); }
    const sourceResult = await client.query(`SELECT source_version, source_json FROM program_source_event WHERE ward_id = $1::uuid AND source_type = 'BAPTISM_EVENT' AND source_id = $2::text LIMIT 1`, [wardId, eventId]);
    const sourceRow = sourceResult.rows[0];
    const source = sourceRow ? baptismProgramSourceSchema.strip().safeParse(sourceRow.source_json) : null;
    if (!source?.success || source.data.wardId !== wardId || source.data.eventId !== eventId || source.data.eventVersion !== String(sourceRow.source_version)) { await client.query('ROLLBACK'); return NextResponse.json({ error: 'Baptism program not found', code: 'NOT_FOUND' }, { status: 404 }); }
    const document = await loadBaptismProgramDocument(client, { wardId, eventId });
    if (!document || document.source.sourceVersion !== String(sourceRow.source_version)) { await client.query('ROLLBACK'); return NextResponse.json({ error: 'The baptism program source changed; reload before printing', code: 'SOURCE_CHANGED' }, { status: 409 }); }
    await client.query('COMMIT');
    return new NextResponse(renderBaptismProgram(document), { headers: { 'content-type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
  } catch { await client.query('ROLLBACK').catch(() => undefined); return NextResponse.json({ error: 'Failed to render baptism program', code: 'INTERNAL_ERROR' }, { status: 500 }); } finally { client.release(); }
}
