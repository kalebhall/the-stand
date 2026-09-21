import { describe, expect, it } from 'vitest';
import { parseTemplateScope, resolveTemplateScope } from './template-scope';

describe('template scope isolation', () => {
  it('parses only supported scopes', () => {
    expect(parseTemplateScope('STAKE')).toBe('STAKE');
    expect(() => parseTemplateScope('OTHER')).toThrow();
  });

  it('allows system reads but not unpublished copies', () => {
    expect(resolveTemplateScope({ scope_type: 'SYSTEM', scope_id: null, created_by_user_id: null, status: 'PUBLISHED' }, { userId: 'u', wardId: 'w', stakeId: 's' })).toEqual({ canRead: true, canCopy: true, reason: 'SYSTEM' });
    expect(resolveTemplateScope({ scope_type: 'SYSTEM', scope_id: null, created_by_user_id: null, status: 'DRAFT' }, { userId: 'u', wardId: 'w', stakeId: 's' }).canCopy).toBe(false);
  });

  it('rejects cross-stake and cross-ward access', () => {
    const context = { userId: 'u', wardId: 'ward-a', stakeId: 'stake-a' };
    expect(resolveTemplateScope({ scope_type: 'STAKE', scope_id: 'stake-b', created_by_user_id: null, status: 'PUBLISHED' }, context).canRead).toBe(false);
    expect(resolveTemplateScope({ scope_type: 'WARD', scope_id: 'ward-b', created_by_user_id: null, status: 'PUBLISHED' }, context).canRead).toBe(false);
  });

  it('requires personal draft ownership', () => {
    const template = { scope_type: 'PERSONAL_DRAFT' as const, scope_id: 'ward-a', created_by_user_id: 'owner', status: 'DRAFT' as const };
    expect(resolveTemplateScope(template, { userId: 'owner', wardId: 'ward-a', stakeId: 'stake-a' }).canRead).toBe(true);
    expect(resolveTemplateScope(template, { userId: 'other', wardId: 'ward-a', stakeId: 'stake-a' }).canRead).toBe(false);
  });
});
