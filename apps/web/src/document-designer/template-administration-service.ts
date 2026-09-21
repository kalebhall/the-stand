import type { TemplateAuthorizationSession, TemplateScope } from '@/src/auth/roles';
import { canManageStakeTemplates, canCopyAvailableTemplate } from '@/src/auth/roles';
import { resolveTemplateScope, type TemplateScopeRow } from './template-scope';

export type SqlClient = { query<T = unknown>(text: string, values?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }> };
export type TemplateAuthorizer = {
  canCreateDraft: (session: TemplateAuthorizationSession, scope: TemplateScope, scopeId: string | null) => boolean;
  canPublish: (session: TemplateAuthorizationSession, scope: TemplateScope, scopeId: string | null) => boolean;
};
export type DraftInput = { scopeType: TemplateScope; scopeId: string | null; name: string; description?: string | null; distributionPolicy?: 'USE_AS_IS' | 'DUPLICATE_AND_CUSTOMIZE' | 'REQUIRED' };
type TemplateRow = TemplateScopeRow & { id: string; current_published_version_id?: string | null };

const denyAuthorizer: TemplateAuthorizer = { canCreateDraft: () => false, canPublish: () => false };

function isSystemAdmin(session: TemplateAuthorizationSession): boolean {
  return session.roles?.some((role) => role.trim().toUpperCase() === 'SYSTEM_ADMIN') === true;
}

function scopePermission(session: TemplateAuthorizationSession, row: TemplateScopeRow, userId: string, authorizer: TemplateAuthorizer, operation: 'create' | 'publish'): boolean {
  if (row.scope_type === 'SYSTEM') return isSystemAdmin(session);
  if (row.scope_type === 'STAKE') return row.scope_id !== null && canManageStakeTemplates(session, row.scope_id);
  if (row.scope_type === 'WARD') {
    return row.scope_id !== null && row.scope_id === session.activeWardId && (operation === 'create'
      ? authorizer.canCreateDraft(session, row.scope_type, row.scope_id)
      : authorizer.canPublish(session, row.scope_type, row.scope_id));
  }
  return row.scope_id !== null && row.scope_id === session.activeWardId && row.created_by_user_id === userId
    && (operation === 'create' ? authorizer.canCreateDraft(session, row.scope_type, row.scope_id) : authorizer.canPublish(session, row.scope_type, row.scope_id));
}

async function loadTemplate(client: SqlClient, templateId: string): Promise<TemplateRow | undefined> {
  const result = await client.query<TemplateRow>(
    `SELECT id, scope_type, scope_id, status, created_by_user_id, current_published_version_id
       FROM document_template
      WHERE id = $1::uuid
      LIMIT 1
      FOR UPDATE`,
    [templateId]
  );
  return result?.rows?.[0];
}

function scopeAllowed(session: TemplateAuthorizationSession, input: DraftInput, userId: string, authorizer: TemplateAuthorizer): boolean {
  const row: TemplateScopeRow = { scope_type: input.scopeType, scope_id: input.scopeId, created_by_user_id: input.scopeType === 'SYSTEM' ? null : userId, status: 'DRAFT' };
  return scopePermission(session, row, userId, authorizer, 'create');
}

export async function createTemplateDraft(client: SqlClient, session: TemplateAuthorizationSession, userId: string, input: DraftInput, authorizer: TemplateAuthorizer = denyAuthorizer): Promise<unknown> {
  if (!scopeAllowed(session, input, userId, authorizer)) throw new Error('TEMPLATE_CREATE_FORBIDDEN');
  const result = await client.query(
    `INSERT INTO document_template (scope_type, scope_id, name, description, distribution_policy, created_by_user_id)
     VALUES ($1::text, $2::uuid, $3::text, $4::text, $5::text, $6::uuid) RETURNING *`,
    [input.scopeType, input.scopeId, input.name, input.description ?? null, input.distributionPolicy ?? 'DUPLICATE_AND_CUSTOMIZE', input.scopeType === 'SYSTEM' ? null : userId]
  );
  return result.rows[0];
}

export async function createImmutableVersion(
  client: SqlClient,
  session: TemplateAuthorizationSession,
  userId: string,
  templateId: string,
  version: number,
  layout: unknown,
  theme: unknown,
  lock: unknown,
  authorizer: TemplateAuthorizer = denyAuthorizer
): Promise<unknown> {
  const template = await loadTemplate(client, templateId);
  if (!template || !scopePermission(session, template, userId, authorizer, 'create')) throw new Error('TEMPLATE_VERSION_FORBIDDEN');
  const result = await client.query(
    `INSERT INTO document_template_version (template_id, version, schema_version, layout_json, theme_json, lock_json, created_by_user_id)
     SELECT $1::uuid, $2::integer, 1, $3::jsonb, $4::jsonb, $5::jsonb, $6::uuid
      WHERE EXISTS (
        SELECT 1 FROM document_template t
         WHERE t.id = $1::uuid AND t.scope_type = $7::text
           AND t.scope_id IS NOT DISTINCT FROM $8::uuid
      )
     RETURNING *`,
    [templateId, version, JSON.stringify(layout), JSON.stringify(theme), JSON.stringify(lock), userId, template.scope_type, template.scope_id]
  );
  if (!result.rowCount) throw new Error('TEMPLATE_VERSION_FORBIDDEN');
  return result.rows[0];
}

export async function publishTemplate(client: SqlClient, session: TemplateAuthorizationSession, userId: string, templateId: string, versionId: string, scope: TemplateScope, scopeId: string | null, authorizer: TemplateAuthorizer = denyAuthorizer): Promise<unknown> {
  const template = await loadTemplate(client, templateId);
  if (!template || template.scope_type !== scope || template.scope_id !== scopeId || !scopePermission(session, template, userId, authorizer, 'publish')) throw new Error('TEMPLATE_PUBLISH_FORBIDDEN');
  const result = await client.query(
    `UPDATE document_template t
        SET status = 'PUBLISHED', current_published_version_id = $1::uuid, published_by_user_id = $2::uuid, published_at = now(), updated_at = now()
      WHERE t.id = $3::uuid AND t.scope_type = $4::text AND t.scope_id IS NOT DISTINCT FROM $5::uuid
        AND EXISTS (SELECT 1 FROM document_template_version v WHERE v.id = $1::uuid AND v.template_id = t.id)
      RETURNING t.*`,
    [versionId, userId, templateId, scope, scopeId]
  );
  if (!result.rowCount) throw new Error('TEMPLATE_VERSION_FORBIDDEN');
  return result.rows[0];
}

export async function archiveTemplate(client: SqlClient, session: TemplateAuthorizationSession, templateId: string, scope: TemplateScope, scopeId: string | null, authorizer: TemplateAuthorizer = denyAuthorizer): Promise<unknown> {
  const template = await loadTemplate(client, templateId);
  if (!template || template.scope_type !== scope || template.scope_id !== scopeId || !scopePermission(session, template, '', authorizer, 'publish')) throw new Error('TEMPLATE_ARCHIVE_FORBIDDEN');
  const result = await client.query(
    `UPDATE document_template
        SET status = 'ARCHIVED', updated_at = now()
      WHERE id = $1::uuid AND scope_type = $2::text AND scope_id IS NOT DISTINCT FROM $3::uuid
      RETURNING *`,
    [templateId, scope, scopeId]
  );
  if (!result.rowCount) throw new Error('TEMPLATE_NOT_FOUND');
  return result.rows[0];
}

export async function duplicateTemplate(client: SqlClient, session: TemplateAuthorizationSession, userId: string, source: TemplateScopeRow & { id: string; name: string }, target: DraftInput, authorizer: TemplateAuthorizer = denyAuthorizer): Promise<unknown> {
  const persisted = await loadTemplate(client, source.id);
  if (!persisted || persisted.scope_type !== source.scope_type || persisted.scope_id !== source.scope_id || persisted.status !== 'PUBLISHED') throw new Error('TEMPLATE_COPY_FORBIDDEN');
  const readable = resolveTemplateScope(persisted, { userId, wardId: session.activeWardId ?? null, stakeId: session.activeStakeId ?? null });
  if (!readable.canCopy || !canCopyAvailableTemplate(session, { scopeType: persisted.scope_type, scopeId: persisted.scope_id, ownerUserId: persisted.created_by_user_id, status: persisted.status }, target.scopeId ?? '', userId)) throw new Error('TEMPLATE_COPY_FORBIDDEN');
  if (!persisted.current_published_version_id) throw new Error('TEMPLATE_COPY_FORBIDDEN');
  const sourceVersion = await client.query<{ id: string; version: number }>(
    `SELECT id, version FROM document_template_version
      WHERE id = $1::uuid AND template_id = $2::uuid
      LIMIT 1`,
    [persisted.current_published_version_id, persisted.id]
  );
  if (!sourceVersion.rows[0]) throw new Error('TEMPLATE_COPY_FORBIDDEN');
  const draft = await createTemplateDraft(client, session, userId, target, authorizer);
  const row = draft as Record<string, unknown>;
  await client.query(
    `UPDATE document_template
        SET source_template_id = $1::uuid, source_template_version = v.version
      FROM document_template_version v
      WHERE document_template.id = $2::uuid
        AND v.id = $3::uuid AND v.template_id = $1::uuid
        AND document_template.scope_type = $4::text AND document_template.scope_id IS NOT DISTINCT FROM $5::uuid`,
    [persisted.id, row.id, persisted.current_published_version_id, target.scopeType, target.scopeId]
  );
  return draft;
}

export async function listTemplateHistory(client: SqlClient, templateId: string): Promise<unknown[]> {
  const result = await client.query(`SELECT * FROM document_template_version WHERE template_id = $1::uuid ORDER BY version ASC`, [templateId]);
  return result.rows;
}
