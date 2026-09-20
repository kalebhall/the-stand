import { NextResponse } from 'next/server';
import { z } from 'zod';

import { recordAuditEvent } from '@/src/audit/service';
import { auth } from '@/src/auth/auth';
import { canPublishProgram, canRepublishProgram, canViewProgramDesigner } from '@/src/auth/roles';
import { loadProgramPermissionProfile } from '@/src/document-designer/template-service';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

const publishSchema = z.object({ version: z.number().int().positive().optional() }).strict();

export async function POST(request: Request, context: { params: Promise<{ wardId: string; templateId: string }> }) {
  const session = await auth();
  const { wardId, templateId } = await context.params;
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  if (!canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  const body = publishSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: 'Invalid publish payload', code: 'BAD_REQUEST' }, { status: 400 });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const profile = await loadProgramPermissionProfile(client, wardId);
    const templateResult = await client.query(
      `SELECT id, scope_type, scope_id, status, current_published_version_id
         FROM document_template WHERE id = $1::uuid AND document_type = 'SACRAMENT_PROGRAM' LIMIT 1 FOR UPDATE`,
      [templateId]
    );
    const template = templateResult.rows[0] as Record<string, unknown> | undefined;
    if (!template || template.scope_type !== 'WARD' || template.scope_id !== wardId) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Template not found', code: 'NOT_FOUND' }, { status: 404 });
    }
    const canPublish = template.status === 'PUBLISHED'
      ? canRepublishProgram({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId, profile)
      : canPublishProgram({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId, profile);
    if (!canPublish) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }
    const version = body.data.version ?? Number((await client.query('SELECT MAX(version)::int AS version FROM document_template_version WHERE template_id = $1::uuid', [templateId])).rows[0]?.version);
    const versionResult = await client.query('SELECT id FROM document_template_version WHERE template_id = $1::uuid AND version = $2::int LIMIT 1', [templateId, version]);
    if (!versionResult.rows[0]) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Template version not found', code: 'NOT_FOUND' }, { status: 404 });
    }
    await client.query(
      `UPDATE document_template SET status = 'PUBLISHED', current_published_version_id = $2::uuid, updated_at = now()
        WHERE id = $1::uuid AND scope_type = 'WARD' AND scope_id = $3::uuid`,
      [templateId, (versionResult.rows[0] as Record<string, unknown>).id, wardId]
    );
    await recordAuditEvent(client, { wardId, userId: session.user.id, actorName: session.user.name || session.user.email || null, action: 'PROGRAM_TEMPLATE_PUBLISHED', entityType: 'document_template', entityId: templateId, details: { version }, source: 'manual_ui', severity: 'notice' });
    await client.query('COMMIT');
    return NextResponse.json({ success: true, templateId, version, status: 'PUBLISHED' });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return NextResponse.json({ error: 'Failed to publish document template', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
