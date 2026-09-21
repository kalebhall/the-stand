import { NextResponse } from 'next/server';
import { z } from 'zod';

import { recordAuditEvent } from '@/src/audit/service';
import { canManageStakeTemplates, canManageSystemTemplates, type TemplateAuthorizationSession } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { parseTemplateLayout } from './template-service';
import { checkTemplateLocks } from './template-locks';

type Scope = 'STAKE' | 'SYSTEM';
type Params = { templateId: string };
type Session = { user: { id: string; name?: string | null; email?: string | null; roles?: string[] }; activeWardId?: string | null; activeStakeId?: string | null; stakeAssignments?: { stakeId: string; roleNames: string[] }[] };
type Client = Awaited<ReturnType<typeof pool.connect>>;

export const templateMetadataSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000).nullable().optional(),
  distributionPolicy: z.enum(['USE_AS_IS', 'DUPLICATE_AND_CUSTOMIZE', 'REQUIRED']).optional(),
  layout: z.unknown()
}).strict();
export const patchMetadataSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2_000).nullable().optional(),
  distributionPolicy: z.enum(['USE_AS_IS', 'DUPLICATE_AND_CUSTOMIZE', 'REQUIRED']).optional()
}).strict();
export const versionSchema = z.object({ layout: z.unknown() }).strict();
export const publishSchema = z.object({ version: z.number().int().positive().optional() }).strict();

const unauthorized = () => NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
const forbidden = () => NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
const notFound = () => NextResponse.json({ error: 'Template not found', code: 'NOT_FOUND' }, { status: 404 });

function sessionView(session: Session): TemplateAuthorizationSession {
  return {
    roles: session.user.roles,
    activeWardId: session.activeWardId,
    activeStakeId: session.activeStakeId,
    stakeAssignments: session.stakeAssignments?.map((assignment) => ({
      stakeId: assignment.stakeId,
      roleNames: assignment.roleNames.filter((role): role is 'STAKE_ADMIN' => role === 'STAKE_ADMIN')
    }))
  };
}

function authorized(session: Session, scope: Scope, scopeId: string): boolean {
  const view = sessionView(session);
  return scope === 'SYSTEM' ? canManageSystemTemplates(view) : canManageStakeTemplates(view, scopeId);
}

async function setAdminContext(client: Client, session: Session): Promise<void> {
  await client.query('SELECT set_config($1, $2, true)', ['app.user_id', session.user.id]);
  await client.query('SELECT set_config($1, $2, true)', ['app.ward_id', session.activeWardId ?? '']);
}

function actorName(session: Session): string | null {
  return session.user.name || session.user.email || null;
}

function parseLayout(input: unknown): ReturnType<typeof parseTemplateLayout> | NextResponse {
  try { return parseTemplateLayout(input); } catch { return NextResponse.json({ error: 'Invalid document layout', code: 'BAD_REQUEST' }, { status: 400 }); }
}

async function withTransaction<T>(session: Session, fn: (client: Client) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setAdminContext(client, session);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

async function loadOwnedTemplate(client: Client, scope: Scope, scopeId: string | null, templateId: string) {
  const result = await client.query(
    `SELECT id, template_key, scope_type, scope_id, document_type, name, description, status,
            distribution_policy, source_template_id, source_template_version,
            current_published_version_id, published_by_user_id, published_at, created_by_user_id
       FROM document_template
      WHERE id = $1::uuid AND document_type = 'SACRAMENT_PROGRAM'
        AND scope_type = $2::text
        AND (($2::text = 'SYSTEM' AND scope_id IS NULL) OR ($2::text = 'STAKE' AND scope_id = $3::uuid))
      LIMIT 1`,
    [templateId, scope, scopeId]
  );
  return result.rows[0] as Record<string, unknown> | undefined;
}

function templateJson(row: Record<string, unknown>, version?: Record<string, unknown> | null) {
  return {
    id: row.id, key: row.template_key, scopeType: row.scope_type, name: row.name, description: row.description,
    documentType: row.document_type, status: row.status, distributionPolicy: row.distribution_policy,
    sourceTemplateId: row.source_template_id, sourceTemplateVersion: row.source_template_version,
    currentPublishedVersionId: row.current_published_version_id,
    version: version ? { id: version.id, version: version.version, schemaVersion: version.schema_version, layout: version.layout_json, theme: version.theme_json, lock: version.lock_json } : null
  };
}

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof Error && error.message === 'NOT_FOUND') return notFound();
  return NextResponse.json({ error: fallback, code: 'INTERNAL_ERROR' }, { status: 500 });
}

export async function listTemplates(session: Session | null | undefined, scope: Scope, scopeId: string | null) {
  if (!session?.user?.id) return unauthorized();
  if (scope === 'STAKE' && !scopeId) return forbidden();
  if (!authorized(session, scope, scopeId ?? '')) return forbidden();
  try {
    const result = await withTransaction(session, async (client) => {
      const values: unknown[] = scope === 'SYSTEM' ? [] : [scopeId];
      const where = scope === 'SYSTEM' ? "scope_type = 'SYSTEM'" : "scope_type = 'STAKE' AND scope_id = $1::uuid";
      return client.query(`SELECT id, template_key, scope_type, scope_id, document_type, name, description, status, distribution_policy, source_template_id, source_template_version, current_published_version_id, published_by_user_id, published_at, created_by_user_id FROM document_template WHERE document_type = 'SACRAMENT_PROGRAM' AND ${where} AND status <> 'ARCHIVED' ORDER BY name ASC`, values);
    });
    return NextResponse.json({ templates: result.rows.map((row) => templateJson(row as Record<string, unknown>)) });
  } catch (error) { return errorResponse(error, 'Failed to list document templates'); }
}

export async function createTemplate(request: Request, session: Session | null | undefined, scope: Scope, scopeId: string | null) {
  if (!session?.user?.id) return unauthorized();
  if (scope === 'STAKE' && !scopeId) return forbidden();
  if (!authorized(session, scope, scopeId ?? '')) return forbidden();
  const body = templateMetadataSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Invalid template payload', code: 'BAD_REQUEST' }, { status: 400 });
  const layout = parseLayout(body.data.layout);
  if (layout instanceof NextResponse) return layout;
  try {
    const response = await withTransaction(session, async (client) => {
      const inserted = await client.query(
        `INSERT INTO document_template (scope_type, scope_id, document_type, name, description, status, distribution_policy, created_by_user_id)
         VALUES ($1::text, $2::uuid, 'SACRAMENT_PROGRAM', $3::text, $4::text, 'DRAFT', $5::text, $6::uuid)
         RETURNING id, template_key, scope_type, scope_id, document_type, name, description, status, distribution_policy, source_template_id, source_template_version, current_published_version_id, published_by_user_id, published_at, created_by_user_id`,
        [scope, scopeId, body.data.name, body.data.description ?? null, body.data.distributionPolicy ?? 'DUPLICATE_AND_CUSTOMIZE', scope === 'SYSTEM' ? null : session.user.id]
      );
      const row = inserted.rows[0] as Record<string, unknown>;
      const version = await client.query(
        `INSERT INTO document_template_version (template_id, version, schema_version, layout_json, theme_json, lock_json, created_by_user_id)
         VALUES ($1::uuid, 1, $2::int, $3::jsonb, $4::jsonb, $5::jsonb, $6::uuid)
         RETURNING id, version, schema_version, layout_json, theme_json, lock_json, created_at`,
        [row.id, layout.schemaVersion, JSON.stringify(layout), JSON.stringify(layout.theme), JSON.stringify(layout.lock ?? {}), session.user.id]
      );
      await recordAuditEvent(client, { wardId: null, userId: session.user.id, actorName: actorName(session), action: scope === 'STAKE' ? 'STAKE_TEMPLATE_CREATED' : 'SYSTEM_TEMPLATE_CREATED', entityType: 'document_template', entityId: String(row.id), details: { scopeId }, source: 'api', severity: 'notice' });
      return { template: templateJson(row, version.rows[0] as Record<string, unknown>) };
    });
    return NextResponse.json(response, { status: 201 });
  } catch (error) { return errorResponse(error, 'Failed to create document template'); }
}

export async function detail(session: Session | null | undefined, scope: Scope, scopeId: string | null, templateId: string) {
  if (!session || !session.user.id) return unauthorized();
  if (!authorized(session, scope, scopeId ?? '')) return forbidden();
  try {
    const response = await withTransaction(session, async (client) => {
      const row = await loadOwnedTemplate(client, scope, scopeId, templateId);
      if (!row) throw new Error('NOT_FOUND');
      const version = row.current_published_version_id ? await client.query('SELECT id, version, schema_version, layout_json, theme_json, lock_json FROM document_template_version WHERE id = $1::uuid', [row.current_published_version_id]) : { rows: [] };
      return { template: templateJson(row, (version.rows[0] as Record<string, unknown> | undefined) ?? null) };
    });
    return NextResponse.json(response);
  } catch (error) { return errorResponse(error, 'Failed to load document template'); }
}

export async function patchDetail(request: Request, session: Session | null | undefined, scope: Scope, scopeId: string | null, templateId: string) {
  if (!session || !session.user.id) return unauthorized();
  if (!authorized(session, scope, scopeId ?? '')) return forbidden();
  const body = patchMetadataSchema.safeParse(await request.json().catch(() => null));
  if (!body.success || Object.keys(body.data).length === 0) return NextResponse.json({ error: 'Invalid template metadata payload', code: 'BAD_REQUEST' }, { status: 400 });
  try {
    const response = await withTransaction(session, async (client) => {
      const row = await loadOwnedTemplate(client, scope, scopeId, templateId);
      if (!row) throw new Error('NOT_FOUND');
      if (row.status !== 'DRAFT') throw new Error('IMMUTABLE_TEMPLATE');
      const updates: string[] = []; const values: unknown[] = [];
      for (const [key, value] of Object.entries(body.data)) { updates.push(`${key === 'distributionPolicy' ? 'distribution_policy' : key} = $${values.length + 1}`); values.push(value); }
      values.push(templateId);
      const updated = await client.query(`UPDATE document_template SET ${updates.join(', ')}, updated_at = now() WHERE id = $${values.length}::uuid RETURNING id, template_key, scope_type, scope_id, document_type, name, description, status, distribution_policy, source_template_id, source_template_version, current_published_version_id, published_by_user_id, published_at, created_by_user_id`, values);
      return { template: templateJson(updated.rows[0] as Record<string, unknown>) };
    });
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof Error && error.message === 'IMMUTABLE_TEMPLATE') return NextResponse.json({ error: 'Published and archived templates cannot be edited', code: 'IMMUTABLE_TEMPLATE' }, { status: 409 });
    return errorResponse(error, 'Failed to update document template');
  }
}

export async function versions(session: Session | null | undefined, scope: Scope, scopeId: string | null, templateId: string, request: Request, method: 'GET' | 'POST') {
  if (!session || !session.user.id) return unauthorized();
  if (!authorized(session, scope, scopeId ?? '')) return forbidden();
  if (method === 'GET') {
    try { const response = await withTransaction(session, async (client) => { const row = await loadOwnedTemplate(client, scope, scopeId, templateId); if (!row) throw new Error('NOT_FOUND'); const result = await client.query('SELECT id, version, schema_version, layout_json, theme_json, lock_json, created_by_user_id, created_at FROM document_template_version WHERE template_id = $1::uuid ORDER BY version DESC', [templateId]); return { template: { id: row.id, name: row.name, scopeType: row.scope_type, status: row.status }, versions: result.rows }; }); return NextResponse.json(response); } catch (error) { return errorResponse(error, 'Failed to list template versions'); }
  }
  const body = versionSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Invalid template version payload', code: 'BAD_REQUEST' }, { status: 400 });
  const layout = parseLayout(body.data.layout); if (layout instanceof NextResponse) return layout;
  try {
    const response = await withTransaction(session, async (client) => {
      const row = await loadOwnedTemplate(client, scope, scopeId, templateId); if (!row) throw new Error('NOT_FOUND'); if (row.status !== 'DRAFT') throw new Error('IMMUTABLE_TEMPLATE');
      const latest = await client.query('SELECT version, layout_json, lock_json FROM document_template_version WHERE template_id = $1::uuid ORDER BY version DESC LIMIT 1', [templateId]);
      const base = latest.rows[0] as Record<string, unknown> | undefined;
      if (base) { const check = checkTemplateLocks(base.layout_json, layout, base.lock_json); if (!check.ok) { await recordAuditEvent(client, { wardId: null, userId: session.user.id, actorName: actorName(session), action: 'PROGRAM_TEMPLATE_LOCK_VIOLATION', entityType: 'document_template', entityId: templateId, details: { violations: check.violations }, source: 'api', severity: 'security' }); throw new Error('LOCK_VIOLATION'); } }
      const next = Number(base?.version ?? 0) + 1;
      const result = await client.query(`INSERT INTO document_template_version (template_id, version, schema_version, layout_json, theme_json, lock_json, created_by_user_id) VALUES ($1::uuid, $2::int, $3::int, $4::jsonb, $5::jsonb, $6::jsonb, $7::uuid) RETURNING id, version, schema_version, layout_json, theme_json, lock_json, created_at`, [templateId, next, layout.schemaVersion, JSON.stringify(layout), JSON.stringify(layout.theme), JSON.stringify(layout.lock ?? {}), session.user.id]);
      await recordAuditEvent(client, { wardId: null, userId: session.user.id, actorName: actorName(session), action: scope === 'STAKE' ? 'STAKE_TEMPLATE_VERSION_CREATED' : 'SYSTEM_TEMPLATE_VERSION_CREATED', entityType: 'document_template', entityId: templateId, details: { version: next }, source: 'api', severity: 'notice' });
      return { version: result.rows[0] };
    });
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'IMMUTABLE_TEMPLATE') return NextResponse.json({ error: 'Published and archived templates cannot be changed', code: 'IMMUTABLE_TEMPLATE' }, { status: 409 });
    if (error instanceof Error && error.message === 'LOCK_VIOLATION') return NextResponse.json({ error: 'Template lock policy violation', code: 'LOCK_VIOLATION' }, { status: 409 });
    return errorResponse(error, 'Failed to create template version');
  }
}

export async function publish(session: Session | null | undefined, scope: Scope, scopeId: string | null, templateId: string, request: Request) {
  if (!session || !session.user.id) return unauthorized(); if (!authorized(session, scope, scopeId ?? '')) return forbidden();
  const body = publishSchema.safeParse(await request.json().catch(() => ({}))); if (!body.success) return NextResponse.json({ error: 'Invalid publish payload', code: 'BAD_REQUEST' }, { status: 400 });
  try { const response = await withTransaction(session, async (client) => { const row = await loadOwnedTemplate(client, scope, scopeId, templateId); if (!row) throw new Error('NOT_FOUND'); if (row.status === 'ARCHIVED') throw new Error('IMMUTABLE_TEMPLATE'); const version = body.data.version ?? Number((await client.query('SELECT MAX(version)::int AS version FROM document_template_version WHERE template_id = $1::uuid', [templateId])).rows[0]?.version); const found = await client.query('SELECT id FROM document_template_version WHERE template_id = $1::uuid AND version = $2::int', [templateId, version]); if (!found.rows[0]) throw new Error('VERSION_NOT_FOUND'); await client.query(`UPDATE document_template SET status = 'PUBLISHED', current_published_version_id = $2::uuid, published_by_user_id = $3::uuid, published_at = now(), updated_at = now() WHERE id = $1::uuid`, [templateId, (found.rows[0] as Record<string, unknown>).id, session.user.id]); await recordAuditEvent(client, { wardId: null, userId: session.user.id, actorName: actorName(session), action: scope === 'STAKE' ? 'STAKE_TEMPLATE_PUBLISHED' : 'SYSTEM_TEMPLATE_PUBLISHED', entityType: 'document_template', entityId: templateId, details: { version }, source: 'api', severity: 'notice' }); return { success: true, templateId, version, status: 'PUBLISHED' }; }); return NextResponse.json(response); } catch (error) { if (error instanceof Error && error.message === 'VERSION_NOT_FOUND') return NextResponse.json({ error: 'Template version not found', code: 'NOT_FOUND' }, { status: 404 }); if (error instanceof Error && error.message === 'IMMUTABLE_TEMPLATE') return NextResponse.json({ error: 'Archived templates cannot be published', code: 'IMMUTABLE_TEMPLATE' }, { status: 409 }); return errorResponse(error, 'Failed to publish document template'); }
}

export async function archive(session: Session | null | undefined, scope: Scope, scopeId: string | null, templateId: string) {
  if (!session || !session.user.id) return unauthorized(); if (!authorized(session, scope, scopeId ?? '')) return forbidden();
  try { const response = await withTransaction(session, async (client) => { const row = await loadOwnedTemplate(client, scope, scopeId, templateId); if (!row) throw new Error('NOT_FOUND'); await client.query("UPDATE document_template SET status = 'ARCHIVED', updated_at = now() WHERE id = $1::uuid", [templateId]); await recordAuditEvent(client, { wardId: null, userId: session.user.id, actorName: actorName(session), action: scope === 'STAKE' ? 'STAKE_TEMPLATE_ARCHIVED' : 'SYSTEM_TEMPLATE_ARCHIVED', entityType: 'document_template', entityId: templateId, source: 'api', severity: 'notice' }); return { success: true, templateId, status: 'ARCHIVED' }; }); return NextResponse.json(response); } catch (error) { return errorResponse(error, 'Failed to archive document template'); }
}

export type { Params, Scope, Session };
