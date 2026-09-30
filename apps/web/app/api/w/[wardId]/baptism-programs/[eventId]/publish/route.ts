import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canPublishProgram, canRepublishProgram } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { isWardModuleEnabled } from '@/src/modules/service';
import { loadBaptismProgramDocument } from '@/src/programs/baptism-persistence';
import { baptismProgramSourceSchema } from '@/src/programs/baptism-adapter';
import { publicBaptismDocument, renderBaptismProgram } from '@/src/programs/baptism-renderer';

export async function POST(request: Request, context: { params: Promise<{ wardId: string; eventId: string }> }) {
  const { wardId, eventId } = await context.params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  if (session.activeWardId !== wardId) return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  if (!(await isWardModuleEnabled(wardId, session.user.id, 'programs'))) return NextResponse.json({ error: 'Programs is disabled for this ward', code: 'FEATURE_DISABLED' }, { status: 404 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    await client.query('LOCK TABLE ward_module_enablement IN SHARE MODE');
    const enabled = await client.query(`SELECT enabled FROM ward_module_enablement WHERE ward_id = $1::uuid AND module_id = 'programs' LIMIT 1`, [wardId]);
    if (enabled.rows[0]?.enabled !== true) { await client.query('ROLLBACK'); return NextResponse.json({ error: 'Programs is disabled for this ward', code: 'FEATURE_DISABLED' }, { status: 404 }); }
    const profileResult = await client.query(`SELECT allow_program_editor_publish, allow_program_editor_republish, public_program_expiration_days FROM ward_document_settings WHERE ward_id = $1::uuid LIMIT 1 FOR UPDATE`, [wardId]);
    const profile = profileResult.rows[0] ?? {};
    await client.query('LOCK TABLE program_publication IN SHARE ROW EXCLUSIVE MODE');
    const existingResult = await client.query(`SELECT 1 FROM program_publication WHERE ward_id = $1::uuid AND program_type = 'BAPTISM_PROGRAM' AND source_type = 'BAPTISM_EVENT' AND source_id = $2::text LIMIT 1`, [wardId, eventId]);
    const isRepublish = existingResult.rows.length > 0;
    const allowed = isRepublish
      ? canRepublishProgram({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId, { allowProgramEditorRepublish: profile.allow_program_editor_republish === true })
      : canPublishProgram({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId, { allowProgramEditorPublish: profile.allow_program_editor_publish === true });
    if (!allowed) { await client.query('ROLLBACK'); return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 }); }
    const sourceResult = await client.query(`SELECT source_version, source_json FROM program_source_event WHERE ward_id = $1::uuid AND source_type = 'BAPTISM_EVENT' AND source_id = $2::text LIMIT 1 FOR UPDATE`, [wardId, eventId]);
    const sourceRow = sourceResult.rows[0];
    const source = sourceRow ? baptismProgramSourceSchema.strip().safeParse(sourceRow.source_json) : null;
    if (!source?.success || source.data.wardId !== wardId || source.data.eventId !== eventId || source.data.eventVersion !== String(sourceRow.source_version)) { await client.query('ROLLBACK'); return NextResponse.json({ error: 'Baptism program not found', code: 'NOT_FOUND' }, { status: 404 }); }
    const document = await loadBaptismProgramDocument(client, { wardId, eventId });
    if (!document || document.source.sourceVersion !== String(sourceRow.source_version)) { await client.query('ROLLBACK'); return NextResponse.json({ error: 'Baptism program source changed; reload before publishing', code: 'SOURCE_CHANGED' }, { status: 409 }); }
    const versionResult = await client.query(`SELECT COALESCE(MAX(version), 0)::int + 1 AS next_version FROM program_publication WHERE ward_id = $1::uuid AND program_type = 'BAPTISM_PROGRAM' AND source_type = 'BAPTISM_EVENT' AND source_id = $2::text`, [wardId, eventId]);
    const version = Number(versionResult.rows[0]?.next_version);
    const token = randomBytes(24).toString('base64url');
    const publicJson = publicBaptismDocument(document);
    const expirationDays = profile.public_program_expiration_days == null ? null : Number(profile.public_program_expiration_days);
    const expiresAt = expirationDays !== null && Number.isInteger(expirationDays) && expirationDays > 0
      ? new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000)
      : null;
    const inserted = await client.query(`INSERT INTO program_publication (ward_id, program_type, source_type, source_id, version, token, render_html, document_json, published_by_user_id, expires_at)
      VALUES ($1::uuid, 'BAPTISM_PROGRAM', 'BAPTISM_EVENT', $2::text, $3::int, $4::text, $5::text, $6::jsonb, app.current_user_id(), $7::timestamptz) RETURNING id, version`, [wardId, eventId, version, token, renderBaptismProgram(document), JSON.stringify(publicJson), expiresAt]);
    await client.query(`INSERT INTO program_publication_pointer (ward_id, program_type, source_type, source_id, publication_id, token)
      VALUES ($1::uuid, 'BAPTISM_PROGRAM', 'BAPTISM_EVENT', $2::text, $3::uuid, $4::text)
      ON CONFLICT (ward_id, program_type, source_type, source_id) DO UPDATE SET publication_id = EXCLUDED.publication_id, token = EXCLUDED.token, updated_at = now()`, [wardId, eventId, inserted.rows[0]?.id, token]);
    await client.query('COMMIT');
    return NextResponse.json({ token, version, publicPath: `/p/baptism/${token}`, publicationId: inserted.rows[0]?.id });
  } catch { await client.query('ROLLBACK').catch(() => undefined); return NextResponse.json({ error: 'Failed to publish baptism program', code: 'INTERNAL_ERROR' }, { status: 500 }); } finally { client.release(); }
}
