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
  distributionPolicy: z.enum(['USE_AS_IS', 'DUPLICATE_AND_CUSTOMIZE', 'REQUIRED']).optional(),
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
    distributionPolicy: 'USE_AS_IS',
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
      `SELECT t.id, t.template_key, t.scope_type, t.scope_id, t.document_type, t.name, t.description, t.status,
              t.current_published_version_id, t.created_by_user_id, t.distribution_policy,
              t.source_template_id, t.source_template_version,
              v.id AS version_id, v.version, v.schema_version, v.layout_json, v.theme_json, v.lock_json
         FROM document_template t
         LEFT JOIN document_template_version v ON v.id = t.current_published_version_id
        WHERE t.document_type = 'SACRAMENT_PROGRAM'
          AND t.status <> 'ARCHIVED'
          AND ((t.scope_type = 'STAKE' AND t.status = 'PUBLISHED' AND t.scope_id = (SELECT stake_id FROM ward WHERE id = $1::uuid))
            OR (t.scope_type = 'WARD' AND t.scope_id = $1::uuid AND t.status = 'PUBLISHED' AND t.current_published_version_id IS NOT NULL)
            OR (t.scope_type = 'PERSONAL_DRAFT' AND t.scope_id = $1::uuid AND t.created_by_user_id = $2::uuid AND t.status = 'PUBLISHED' AND t.current_published_version_id IS NOT NULL))
        ORDER BY t.name ASC`,
      [wardId, session.user.id]
    );
    await client.query('COMMIT');
    return NextResponse.json({ templates: [...builtInResponse(), ...(result.rows as unknown as Array<TemplateDbRow & Record<string, unknown>>).map((row) => templateResponse(row, row.version_id ? { id: row.version_id, version: row.version, schema_version: row.schema_version, layout_json: row.layout_json, theme_json: row.theme_json, lock_json: row.lock_json } : null))] });
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
      `INSERT INTO document_template (scope_type, scope_id, document_type, name, description, distribution_policy, status, created_by_user_id)
       VALUES ($1::text, $2::uuid, 'SACRAMENT_PROGRAM', $3::text, $4::text, $5::text, 'DRAFT', $6::uuid)
       RETURNING id, template_key, scope_type, scope_id, document_type, name, description, distribution_policy, source_template_id, source_template_version, status, current_published_version_id, created_by_user_id`,
      [parsed.data.scopeType, wardId, parsed.data.name, parsed.data.description ?? null, parsed.data.distributionPolicy ?? 'DUPLICATE_AND_CUSTOMIZE', session.user.id]
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
