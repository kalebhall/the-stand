import { z } from 'zod';

import { REUSABLE_BLOCK_SCOPES, REUSABLE_BLOCK_TYPES, assertReusableBlockSnapshot, type ReusableBlockScope, type ReusableBlockSnapshot } from './reusable-blocks';
import { REUSABLE_BLOCK_SOURCE_KEYS } from './reusable-block-sources';

const uuid = z.string().uuid();

export const reusableBlockSnapshotSchema = z.object({
  version: z.number().int().positive(),
  blockType: z.enum(REUSABLE_BLOCK_TYPES),
  config: z.record(z.string(), z.unknown()),
  width: z.string(),
  visibility: z.string(),
  printBehavior: z.string(),
  digitalBehavior: z.string(),
  source: z.object({ key: z.enum(REUSABLE_BLOCK_SOURCE_KEYS), fallbackText: z.string().max(500).optional() }).strict().optional()
}).strict();

export const createReusableBlockSchema = z.object({
  scope: z.enum(REUSABLE_BLOCK_SCOPES),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  snapshot: reusableBlockSnapshotSchema
}).strict();

export const updateReusableBlockSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  snapshot: reusableBlockSnapshotSchema.optional(),
  archive: z.literal(true).optional(),
  expectedVersion: z.number().int().positive().optional()
}).strict().refine((value) => value.name !== undefined || value.description !== undefined || value.snapshot !== undefined || value.archive !== undefined, 'At least one update is required');

export function validateReusableSnapshot(input: unknown): ReusableBlockSnapshot {
  const parsed = reusableBlockSnapshotSchema.parse(input);
  assertReusableBlockSnapshot(parsed as ReusableBlockSnapshot);
  return parsed as ReusableBlockSnapshot;
}

export function scopeOwner(scope: ReusableBlockScope, userId: string, wardId: string, stakeId: string): { scopeType: ReusableBlockScope; scopeId: string; ownerUserId: string | null } {
  if (scope === 'PERSONAL') return { scopeType: scope, scopeId: wardId, ownerUserId: userId };
  if (scope === 'WARD') return { scopeType: scope, scopeId: wardId, ownerUserId: null };
  return { scopeType: scope, scopeId: stakeId, ownerUserId: null };
}

export { uuid };
