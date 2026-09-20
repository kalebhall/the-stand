import { NextResponse } from 'next/server';
import { z } from 'zod';

import { recordAuditEvent } from '@/src/audit/service';
import { auth } from '@/src/auth/auth';
import { canManageWardProgramTemplates, canViewProgramDesigner } from '@/src/auth/roles';
import { BUILT_IN_TEMPLATES } from '@/src/document-designer/built-in-templates';
import { loadProgramPermissionProfile, parseTemplateLayout, templateResponse, type TemplateDbRow } from '@/src/document-designer/template-service';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000).nullable().optional(),
  scopeType: z.enum(['WARD', 'PERSONAL_DRAFT']),
  layout: z.unknown()
}).strict();

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
}

function builtInResponse() {
  return BUILT_IN_TEMPLATES.map((template) => ({
    id: template.key,
    key: template.key,
    source: template.source,
    scopeType: 'SYSTEM',
    name: template.name,
    description: template.description,
    documentType: template.documentType,
    status: 'PUBLISHED',
    thumbnail: template.thumbnail,
    version: { version: 1, schemaVersion: template.layout.schemaVersion, layout: template.layout, theme: template.layout.theme, lock: template.layout.lock ?? null }
  }));
}

export async function GET(_: Request, context: { params: Promise<{ wardId: string }> }) {
  const session = await auth();
  const { wardId } = await context.params;
  if (!session?.user?.id) return unauthorized();
  if (!canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) return forbidden();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const result = await client.query(
      `SELECT id, template_key, scope_type, scope_id, document_type, name, description, status,
              current_published_version_id, created_by_user_id
         FROM document_template
        WHERE document_type = 'SACRAMENT_PROGRAM'
          AND status <> 'ARCHIVED'
          AND ((scope_type = 'STAKE' AND status = 'PUBLISHED')
            OR (scope_type = 'WARD' AND scope_id = $1::uuid AND status = 'PUBLISHED' AND current_published_version_id IS NOT NULL)
            OR (scope_type = 'PERSONAL_DRAFT' AND scope_id = $1::uuid AND created_by_user_id = $2::uuid AND status = 'PUBLISHED' AND current_published_version_id IS NOT NULL))
        ORDER BY name ASC`,
      [wardId, session.user.id]
    );
    await client.query('COMMIT');
    return NextResponse.json({ templates: [...builtInResponse(), ...(result.rows as unknown as TemplateDbRow[]).map((row) => templateResponse(row))] });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return NextResponse.json({ error: 'Failed to list document templates', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function POST(request: Request, context: { params: Promise<{ wardId: string }> }) {
  const session = await auth();
  const { wardId } = await context.params;
  if (!session?.user?.id) return unauthorized();
  if (!canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) return forbidden();
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid template payload', code: 'BAD_REQUEST' }, { status: 400 });
  let layout;
  try {
    layout = parseTemplateLayout(parsed.data.layout);
  } catch {
    return NextResponse.json({ error: 'Invalid document layout', code: 'BAD_REQUEST' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    const profile = await loadProgramPermissionProfile(client, wardId);
    if (!canManageWardProgramTemplates({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId, profile)) {
      await client.query('ROLLBACK');
      return forbidden();
    }
    const inserted = await client.query(
      `INSERT INTO document_template (scope_type, scope_id, document_type, name, description, status, created_by_user_id)
       VALUES ($1::text, $2::uuid, 'SACRAMENT_PROGRAM', $3::text, $4::text, 'DRAFT', $5::uuid)
       RETURNING id, template_key, scope_type, scope_id, document_type, name, description, status, current_published_version_id, created_by_user_id`,
      [parsed.data.scopeType, wardId, parsed.data.name, parsed.data.description ?? null, session.user.id]
    );
    const row = inserted.rows[0] as unknown as TemplateDbRow;
    const version = await client.query(
      `INSERT INTO document_template_version (template_id, version, schema_version, layout_json, theme_json, lock_json, created_by_user_id)
       VALUES ($1::uuid, 1, $2::int, $3::jsonb, $4::jsonb, $5::jsonb, $6::uuid)
       RETURNING id, version, schema_version, layout_json, theme_json, lock_json`,
      [row.id, layout.schemaVersion, JSON.stringify(layout), JSON.stringify(layout.theme), JSON.stringify(layout.lock ?? {}), session.user.id]
    );
    await recordAuditEvent(client, { wardId, userId: session.user.id, actorName: session.user.name || session.user.email || null, action: 'PROGRAM_TEMPLATE_CREATED', entityType: 'document_template', entityId: row.id, details: { scopeType: parsed.data.scopeType }, source: 'manual_ui', severity: 'notice' });
    await client.query('COMMIT');
    return NextResponse.json({ template: templateResponse(row, version.rows[0]) }, { status: 201 });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return NextResponse.json({ error: 'Failed to create document template', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
