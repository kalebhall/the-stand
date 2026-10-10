import { NextResponse } from 'next/server';
import { z } from 'zod';

import { recordAuditEvent } from '@/src/audit/service';
import { auth } from '@/src/auth/auth';
import { canManageMeetings, canManageStakeTemplates, canManageWardProgramTemplates, canUseAdvancedProgramDesigner, canViewProgramDesigner, type TemplateAuthorizationSession } from '@/src/auth/roles';
import { isAdvancedDesignerFeatureEnabled } from '@/src/features/advanced-designer';
import { isWardModuleEnabled, isWardModuleEnabledInTransaction } from '@/src/modules/service';
import { BUILT_IN_TEMPLATES } from '@/src/document-designer/built-in-templates';
import { loadProgramPermissionProfile, assertTemplateReusableReferences, containsAdvancedBlocks, containsAdvancedLayoutStructure, parseTemplateLayout, templateResponse, type TemplateDbRow } from '@/src/document-designer/template-service';
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

async function isMatchingStakeAdmin(session: TemplateAuthorizationSession, wardId: string): Promise<boolean> {
  if (session.activeWardId !== wardId || !session.activeStakeId || !canManageStakeTemplates(session, session.activeStakeId)) return false;
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT 1 FROM ward WHERE id = $1::uuid AND stake_id = $2::uuid LIMIT 1', [wardId, session.activeStakeId]);
    return result.rowCount === 1;
  } finally {
    client.release();
  }
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
  const matchingStakeAdmin = await isMatchingStakeAdmin(session, wardId);
  if (!canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId) && !canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId) && !matchingStakeAdmin) return forbidden();
  if (!isAdvancedDesignerFeatureEnabled() || !(await isWardModuleEnabled(wardId, session.user.id, 'programs'))) return forbidden();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    if (!(await isWardModuleEnabledInTransaction(client, wardId, 'programs'))) {
      await client.query('ROLLBACK');
      return forbidden();
    }
    const result = await client.query(
      `SELECT t.id, t.template_key, t.scope_type, t.scope_id, t.document_type, t.name, t.description, t.status,
              t.current_published_version_id, t.created_by_user_id, t.distribution_policy,
              t.source_template_id, t.source_template_version,
              v.id AS version_id, v.version, v.schema_version, v.layout_json, v.theme_json, v.lock_json
         FROM document_template t
         LEFT JOIN LATERAL (
           SELECT v.id, v.version, v.schema_version, v.layout_json, v.theme_json, v.lock_json
             FROM document_template_version v
            WHERE v.template_id = t.id
              AND (v.id = t.current_published_version_id
                   OR (t.scope_type = 'PERSONAL_DRAFT' AND v.version = (
                     SELECT MAX(personal_version.version)
                       FROM document_template_version personal_version
                      WHERE personal_version.template_id = t.id
                   )))
            ORDER BY CASE WHEN v.id = t.current_published_version_id THEN 0 ELSE 1 END, v.version DESC
            LIMIT 1
         ) v ON TRUE
        WHERE t.document_type = 'SACRAMENT_PROGRAM'
          AND t.status <> 'ARCHIVED'
          AND ((t.scope_type = 'SYSTEM' AND t.scope_id IS NULL AND t.status = 'PUBLISHED' AND t.current_published_version_id IS NOT NULL)
            OR (t.scope_type = 'STAKE' AND t.status = 'PUBLISHED' AND t.scope_id = (SELECT stake_id FROM ward WHERE id = $1::uuid))
            OR (t.scope_type = 'WARD' AND t.scope_id = $1::uuid AND t.status = 'PUBLISHED' AND t.current_published_version_id IS NOT NULL)
            OR (t.scope_type = 'PERSONAL_DRAFT' AND t.scope_id = $1::uuid AND t.created_by_user_id = $2::uuid AND t.status IN ('DRAFT', 'PUBLISHED')))
        ORDER BY t.name ASC`,
      [wardId, session.user.id]
    );
    await client.query('COMMIT');
    const persistedTemplates = result.rows as unknown as Array<TemplateDbRow & Record<string, unknown>>;
    const persistedKeys = new Set(persistedTemplates.map((row) => typeof row.template_key === 'string' ? row.template_key : null).filter((key): key is string => Boolean(key)));
    const compatibilityBuiltIns = builtInResponse().filter((template) => !persistedKeys.has(template.key));
    return NextResponse.json({ templates: [...compatibilityBuiltIns, ...persistedTemplates.map((row) => templateResponse(row, row.version_id ? { id: row.version_id, version: row.version, schema_version: row.schema_version, layout_json: row.layout_json, theme_json: row.theme_json, lock_json: row.lock_json } : null))] });
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
  const matchingStakeAdmin = await isMatchingStakeAdmin(session, wardId);
  if (!canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId) && !matchingStakeAdmin) return forbidden();
  if (!isAdvancedDesignerFeatureEnabled() || !(await isWardModuleEnabled(wardId, session.user.id, 'programs'))) return forbidden();
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
    if (!(await isWardModuleEnabledInTransaction(client, wardId, 'programs'))) {
      await client.query('ROLLBACK');
      return forbidden();
    }
    const profile = await loadProgramPermissionProfile(client, wardId);
    const canManageWard = canManageWardProgramTemplates({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId, profile);
    if ((parsed.data.scopeType === 'PERSONAL_DRAFT' && !canManageWard) || (!matchingStakeAdmin && !canManageWard)) {
      await client.query('ROLLBACK');
      return forbidden();
    }
    await assertTemplateReusableReferences(client, layout, wardId, session.user.id, parsed.data.scopeType === 'PERSONAL_DRAFT' ? 'PERSONAL' : 'WARD');
    if (!matchingStakeAdmin && !canUseAdvancedProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId, profile) && (containsAdvancedBlocks(layout) || containsAdvancedLayoutStructure(parsed.data.layout))) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Advanced blocks are read-only for this editor', code: 'ADVANCED_BLOCK_READ_ONLY' }, { status: 422 });
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
  } catch (error) {
    console.error('template POST failed', error);
    await client.query('ROLLBACK').catch(() => undefined);
    if (error instanceof Error && (error.message === 'TEMPLATE_REUSABLE_REFERENCE_FORBIDDEN' || error.message === 'TEMPLATE_REUSABLE_REFERENCE_INVALID')) return NextResponse.json({ error: 'Reusable block reference is not permitted', code: 'REUSABLE_REFERENCE_FORBIDDEN' }, { status: 422 });
    return NextResponse.json({ error: 'Failed to create document template', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
