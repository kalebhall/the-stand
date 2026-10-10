import { NextResponse } from 'next/server';
import { z } from 'zod';

import { recordAuditEvent } from '@/src/audit/service';
import { auth } from '@/src/auth/auth';
import { canManageStakeTemplates, canManageWardProgramTemplates, canUseAdvancedProgramDesigner, canViewProgramDesigner, hasRole } from '@/src/auth/roles';
import { loadProgramPermissionProfile, canEditTemplate, parseTemplateLayout, prepareTemplateVersionLayout, advancedBlocksChanged, containsAdvancedBlocks, containsAdvancedLayoutStructure, assertTemplateReusableReferences } from '@/src/document-designer/template-service';
import { checkTemplateLocks, parseTemplateLockPolicy } from '@/src/document-designer/template-locks';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';
import { isAdvancedDesignerFeatureEnabled } from '@/src/features/advanced-designer';
import { isWardModuleEnabled, isWardModuleEnabledInTransaction } from '@/src/modules/service';

const versionSchema = z.object({ layout: z.unknown() }).strict();
const defaultLockPolicy = { mode: 'UNLOCKED' as const, lockedPageIds: [], lockedRegionIds: [], lockedBlockIds: [], lockedPropertyNames: [], protectedTheme: false, protectedVisibility: false, protectedOrder: false };

function lockPolicyInput(value: unknown): unknown {
  return value == null ? defaultLockPolicy : value;
}

async function wardBelongsToStake(wardId: string, stakeId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT 1 FROM ward WHERE id = $1::uuid AND stake_id = $2::uuid LIMIT 1', [wardId, stakeId]);
    return result.rowCount === 1;
  } finally {
    client.release();
  }
}

async function loadTemplate(client: Awaited<ReturnType<typeof pool.connect>>, templateId: string, wardId: string, userId: string) {
  const result = await client.query(
    `SELECT id, template_key, scope_type, scope_id, document_type, name, description, status, current_published_version_id, created_by_user_id, distribution_policy
       FROM document_template
      WHERE id = $1::uuid AND document_type = 'SACRAMENT_PROGRAM'
        AND ((scope_type = 'STAKE' AND status IN ('PUBLISHED', 'DRAFT') AND scope_id = (SELECT stake_id FROM ward WHERE id = $2::uuid)) OR (scope_type = 'WARD' AND scope_id = $2::uuid) OR (scope_type = 'PERSONAL_DRAFT' AND scope_id = $2::uuid AND created_by_user_id = $3::uuid))
      LIMIT 1
      FOR UPDATE`,
    [templateId, wardId, userId]
  );
  return result.rows[0] as Record<string, unknown> | undefined;
}

export async function GET(_: Request, context: { params: Promise<{ wardId: string; templateId: string }> }) {
  const session = await auth();
  const { wardId, templateId } = await context.params;
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  const activeWard = session.activeWardId === wardId;
  if (!activeWard || (!canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId) && !(session.activeStakeId && await wardBelongsToStake(wardId, session.activeStakeId) && canManageStakeTemplates(session, session.activeStakeId)))) return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  if (!isAdvancedDesignerFeatureEnabled() || !(await isWardModuleEnabled(wardId, session.user.id, 'programs'))) return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    if (!(await isWardModuleEnabledInTransaction(client, wardId, 'programs'))) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }
    const template = await loadTemplate(client, templateId, wardId, session.user.id);
    if (!template) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Template not found', code: 'NOT_FOUND' }, { status: 404 });
    }
    if (template.scope_type === 'STAKE' && template.status === 'DRAFT' && !(session.activeStakeId && await wardBelongsToStake(wardId, session.activeStakeId) && canManageStakeTemplates(session, session.activeStakeId))) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Template not found', code: 'NOT_FOUND' }, { status: 404 });
    }
    const versions = await client.query(
      `SELECT id, version, schema_version, layout_json, theme_json, lock_json, created_at, created_by_user_id
         FROM document_template_version WHERE template_id = $1::uuid ORDER BY version DESC`,
      [templateId]
    );
    await client.query('COMMIT');
    return NextResponse.json({ template: { id: template.id, name: template.name, scopeType: template.scope_type, status: template.status }, versions: versions.rows });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return NextResponse.json({ error: 'Failed to list template versions', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function POST(request: Request, context: { params: Promise<{ wardId: string; templateId: string }> }) {
  const session = await auth();
  const { wardId, templateId } = await context.params;
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  const activeWard = session.activeWardId === wardId;
  if (!activeWard || (!canViewProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId) && !(session.activeStakeId && await wardBelongsToStake(wardId, session.activeStakeId) && canManageStakeTemplates(session, session.activeStakeId)))) return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  if (!isAdvancedDesignerFeatureEnabled() || !(await isWardModuleEnabled(wardId, session.user.id, 'programs'))) return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  const body = versionSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Invalid template version payload', code: 'BAD_REQUEST' }, { status: 400 });
  let layout: ReturnType<typeof parseTemplateLayout>;
  let incomingLayout: ReturnType<typeof parseTemplateLayout>;
  try {
    incomingLayout = parseTemplateLayout(body.data.layout);
    layout = incomingLayout;
  } catch {
    return NextResponse.json({ error: 'Invalid document layout', code: 'BAD_REQUEST' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });
    if (!(await isWardModuleEnabledInTransaction(client, wardId, 'programs'))) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }
    const template = await loadTemplate(client, templateId, wardId, session.user.id);
    const profile = await loadProgramPermissionProfile(client, wardId);
    const wardStakeId = String((await client.query('SELECT stake_id FROM ward WHERE id = $1::uuid LIMIT 1', [wardId])).rows[0]?.stake_id ?? '');
    const matchingStakeAdmin = Boolean(template?.scope_type === 'WARD' && session.activeStakeId === wardStakeId && canManageStakeTemplates(session, wardStakeId));
    const scopeCanEdit = template?.scope_type === 'STAKE'
      ? Boolean(session.activeStakeId === wardStakeId && canManageStakeTemplates(session, wardStakeId))
      : Boolean(template && (matchingStakeAdmin || hasRole(session.user.roles, 'STAND_ADMIN') || canEditTemplate({ scope_type: String(template.scope_type) as 'WARD' | 'PERSONAL_DRAFT' | 'STAKE' | 'SYSTEM', scope_id: template.scope_id as string | null, created_by_user_id: template.created_by_user_id as string | null }, wardId, session.user.id, profile)));
    const canProgramEdit = canManageWardProgramTemplates({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId, profile) || matchingStakeAdmin || (template?.scope_type === 'STAKE' && scopeCanEdit);
    const advancedEditing = matchingStakeAdmin || (template?.scope_type === 'STAKE' && scopeCanEdit) || canUseAdvancedProgramDesigner({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId, profile);
    if (!template || template.status !== 'DRAFT' || !scopeCanEdit || !canProgramEdit) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }
    let lockPolicy;
    try {
      lockPolicy = parseTemplateLockPolicy(lockPolicyInput(layout.lock));
    } catch {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Invalid lock policy', code: 'BAD_REQUEST' }, { status: 400 });
    }
    const baseResult = await client.query(
      `SELECT layout_json, lock_json FROM document_template_version WHERE template_id = $1::uuid ORDER BY version DESC LIMIT 1`,
      [templateId]
    );
    const base = baseResult.rows[0] as { layout_json?: unknown; lock_json?: unknown } | undefined;
    layout = prepareTemplateVersionLayout(base?.layout_json, body.data.layout);
    try {
      const referenceScope = template?.scope_type === 'STAKE' ? 'STAKE' : template?.scope_type === 'PERSONAL_DRAFT' ? 'PERSONAL' : 'WARD';
      await assertTemplateReusableReferences(client, layout, referenceScope === 'STAKE' ? String(template.scope_id ?? '') : wardId, session.user.id, referenceScope);
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof Error && (error.message === 'TEMPLATE_REUSABLE_REFERENCE_FORBIDDEN' || error.message === 'TEMPLATE_REUSABLE_REFERENCE_INVALID')) {
        return NextResponse.json({ error: 'Reusable block reference is not permitted', code: 'REUSABLE_REFERENCE_FORBIDDEN' }, { status: 422 });
      }
      return NextResponse.json({ error: 'Invalid template layout', code: 'BAD_REQUEST' }, { status: 400 });
    }
    let persistedLockPolicy = lockPolicy;
    if (!advancedEditing && (base
      ? advancedBlocksChanged(base.layout_json, layout)
      : containsAdvancedLayoutStructure(body.data.layout) || containsAdvancedBlocks(layout))) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Advanced blocks are read-only in this editor', code: 'ADVANCED_BLOCK_READ_ONLY' }, { status: 409 });
    }
    if (base) {
      const authoritativeLock = lockPolicyInput(base.lock_json);
      const baseIsSchemaV2 = base.layout_json && typeof base.layout_json === 'object' && (base.layout_json as { schemaVersion?: unknown }).schemaVersion === 2;
      const lockComparisonLayout = !baseIsSchemaV2 && !containsAdvancedLayoutStructure(body.data.layout) ? incomingLayout : layout;
      const lockCheck = checkTemplateLocks(base.layout_json, lockComparisonLayout, authoritativeLock);
      if (!lockCheck.ok) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Template lock violation', code: 'LOCK_VIOLATION', violations: lockCheck.violations }, { status: 409 });
      }
      persistedLockPolicy = parseTemplateLockPolicy(authoritativeLock);
    }
    const latest = await client.query('SELECT COALESCE(MAX(version), 0)::int AS version FROM document_template_version WHERE template_id = $1::uuid', [templateId]);
    const nextVersion = Number((latest.rows[0] as Record<string, unknown>).version) + 1;
    const inserted = await client.query(
      `INSERT INTO document_template_version (template_id, version, schema_version, layout_json, theme_json, lock_json, created_by_user_id)
       VALUES ($1::uuid, $2::int, $3::int, $4::jsonb, $5::jsonb, $6::jsonb, $7::uuid)
       RETURNING id, version, schema_version, layout_json, theme_json, lock_json`,
      [templateId, nextVersion, layout.schemaVersion, JSON.stringify(layout), JSON.stringify(layout.theme), JSON.stringify(persistedLockPolicy), session.user.id]
    );
    await recordAuditEvent(client, { wardId, userId: session.user.id, actorName: session.user.name || session.user.email || null, action: 'PROGRAM_TEMPLATE_VERSION_CREATED', entityType: 'document_template', entityId: templateId, details: { version: nextVersion }, source: 'manual_ui', severity: 'notice' });
    await client.query('COMMIT');
    return NextResponse.json({ version: inserted.rows[0] }, { status: 201 });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error instanceof Error && error.message === 'ADVANCED_BLOCK_READ_ONLY') return NextResponse.json({ error: 'Advanced blocks are read-only in this editor', code: 'ADVANCED_BLOCK_READ_ONLY' }, { status: 409 });
    return NextResponse.json({ error: 'Failed to create template version', code: 'INTERNAL_ERROR' }, { status: 500 });
  } finally {
    client.release();
  }
}
