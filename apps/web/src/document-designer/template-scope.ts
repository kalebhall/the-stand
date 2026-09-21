import { z } from 'zod';

export const templateScopeSchema = z.enum(['SYSTEM', 'STAKE', 'WARD', 'PERSONAL_DRAFT']);
export type TemplateScopeType = z.infer<typeof templateScopeSchema>;

export type TemplateScopeRow = {
  scope_type: TemplateScopeType;
  scope_id: string | null;
  created_by_user_id: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
};
export type ScopeContext = { userId: string; wardId: string | null; stakeId: string | null };
export type ScopeDecision = { canRead: boolean; canCopy: boolean; reason: 'SYSTEM' | 'STAKE' | 'WARD' | 'PERSONAL_DRAFT' | 'NO_MATCH' };

export function parseTemplateScope(input: unknown): TemplateScopeType {
  return templateScopeSchema.parse(input);
}

export function resolveTemplateScope(template: TemplateScopeRow, context: ScopeContext): ScopeDecision {
  switch (template.scope_type) {
    case 'SYSTEM':
      return { canRead: true, canCopy: template.status === 'PUBLISHED', reason: 'SYSTEM' };
    case 'STAKE': {
      const match = template.scope_id !== null && template.scope_id === context.stakeId && template.status === 'PUBLISHED';
      return { canRead: match, canCopy: match, reason: match ? 'STAKE' : 'NO_MATCH' };
    }
    case 'WARD': {
      const match = template.scope_id !== null && template.scope_id === context.wardId;
      return { canRead: match, canCopy: match && template.status === 'PUBLISHED', reason: match ? 'WARD' : 'NO_MATCH' };
    }
    case 'PERSONAL_DRAFT': {
      const match = template.scope_id !== null && template.scope_id === context.wardId && template.created_by_user_id === context.userId;
      return { canRead: match, canCopy: match, reason: match ? 'PERSONAL_DRAFT' : 'NO_MATCH' };
    }
    default: {
      const exhaustive: never = template.scope_type;
      return exhaustive;
    }
  }
}
