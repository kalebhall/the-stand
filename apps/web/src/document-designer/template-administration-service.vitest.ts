import { describe, expect, it, vi } from 'vitest';
import {
  archiveTemplate,
  createImmutableVersion,
  createTemplateDraft,
  duplicateTemplate,
  listTemplateHistory,
  publishTemplate,
} from './template-administration-service';

const authorizer = { canCreateDraft: () => true, canPublish: () => true };
const systemAdmin = { roles: ['SYSTEM_ADMIN'], activeWardId: 'ward-a', activeStakeId: 'stake-a', stakeAssignments: [] };
const stakeAdmin = { roles: [], activeWardId: 'ward-a', activeStakeId: 'stake-a', stakeAssignments: [{ stakeId: 'stake-a', roleNames: ['STAKE_ADMIN'] }] };
const wardEditor = { roles: [], activeWardId: 'ward-a', activeStakeId: 'stake-a', stakeAssignments: [] };

function scopedClient(template: Record<string, unknown>, mutation = { rows: [template], rowCount: 1 }) {
  return { query: vi.fn()
    .mockResolvedValueOnce({ rows: [template], rowCount: 1 })
    .mockResolvedValueOnce(mutation) };
}

describe('template administration service', () => {
  it('casts draft insert parameters and preserves explicit policy', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [{ id: 'template-a' }], rowCount: 1 }) };
    const result = await createTemplateDraft(client, systemAdmin, 'user-a', { scopeType: 'SYSTEM', scopeId: null, name: 'System', distributionPolicy: 'USE_AS_IS' }, authorizer);
    expect(result).toEqual({ id: 'template-a' });
    expect(client.query.mock.calls[0][0]).toContain('$1::text');
    expect(client.query.mock.calls[0][1]).toContain('USE_AS_IS');
  });

  it('rejects a non-system-admin from mutating a system template before SQL mutation', async () => {
    const client = { query: vi.fn() };
    await expect(createImmutableVersion(client, wardEditor, 'user-a', 'template-a', 1, {}, {}, {})).rejects.toThrow('TEMPLATE_VERSION_FORBIDDEN');
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('rejects a stake mutation without an assignment', async () => {
    const client = scopedClient({ id: 'template-a', scope_type: 'STAKE', scope_id: 'stake-a', status: 'DRAFT', created_by_user_id: 'user-a' });
    await expect(createImmutableVersion(client, wardEditor, 'user-a', 'template-a', 1, {}, {}, {})).rejects.toThrow('TEMPLATE_VERSION_FORBIDDEN');
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('allows an assigned stake administrator and keeps the scope predicate', async () => {
    const client = scopedClient({ id: 'template-a', scope_type: 'STAKE', scope_id: 'stake-a', status: 'DRAFT', created_by_user_id: 'user-a' });
    await createImmutableVersion(client, stakeAdmin, 'user-a', 'template-a', 1, {}, {}, {});
    expect(client.query.mock.calls[1][0]).toContain('t.scope_type = $7::text');
    expect(client.query.mock.calls[1][0]).toContain('t.scope_id IS NOT DISTINCT FROM $8::uuid');
  });

  it('rejects cross-ward publish and archive using persisted scope, not caller scope', async () => {
    const template = { id: 'template-a', scope_type: 'WARD', scope_id: 'ward-b', status: 'DRAFT', created_by_user_id: 'user-b' };
    const publishClient = scopedClient(template);
    await expect(publishTemplate(publishClient, wardEditor, 'user-a', 'template-a', 'version-a', 'WARD', 'ward-a', authorizer)).rejects.toThrow('TEMPLATE_PUBLISH_FORBIDDEN');
    const archiveClient = scopedClient(template);
    await expect(archiveTemplate(archiveClient, wardEditor, 'template-a', 'WARD', 'ward-a', authorizer)).rejects.toThrow('TEMPLATE_ARCHIVE_FORBIDDEN');
  });

  it('validates source lineage and published version ownership before duplicate mutation', async () => {
    const source = { id: 'source-a', scope_type: 'WARD' as const, scope_id: 'ward-a', status: 'PUBLISHED' as const, created_by_user_id: 'user-a', current_published_version_id: 'version-other', name: 'Source' };
    const client = { query: vi.fn().mockResolvedValueOnce({ rows: [source], rowCount: 1 }) };
    await expect(duplicateTemplate(client, wardEditor, 'user-a', source, { scopeType: 'WARD', scopeId: 'ward-a', name: 'Copy' }, authorizer)).rejects.toThrow();
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it('requires the published version to belong to the template', async () => {
    const template = { id: 'template-a', scope_type: 'WARD', scope_id: 'ward-a', status: 'DRAFT', created_by_user_id: 'user-a' };
    const client = scopedClient(template, { rows: [], rowCount: 0 });
    await expect(publishTemplate(client, wardEditor, 'user-a', 'template-a', 'version-other', 'WARD', 'ward-a', authorizer)).rejects.toThrow('TEMPLATE_VERSION_FORBIDDEN');
    expect(client.query.mock.calls[1][0]).toContain('v.template_id = t.id');
  });

  it('returns version history in ascending order query', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [{ version: 1 }, { version: 2 }] }) };
    await expect(listTemplateHistory(client, 'template-a')).resolves.toHaveLength(2);
    expect(client.query.mock.calls[0][0]).toContain('ORDER BY version ASC');
  });
});
