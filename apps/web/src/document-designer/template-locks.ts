import { z } from 'zod';

export const templateLockModeSchema = z.enum(['UNLOCKED', 'STYLE_LOCKED', 'STRUCTURE_LOCKED', 'CONTENT_ONLY']);
const idList = z.array(z.string().uuid()).max(100).refine((ids) => new Set(ids).size === ids.length, 'IDs must be unique');
const propertyList = z.array(z.string().min(1).max(100)).max(100).refine((items) => new Set(items).size === items.length, 'properties must be unique');
export const templateLockPolicySchema = z.object({
  mode: templateLockModeSchema,
  lockedPageIds: idList.default([]),
  lockedRegionIds: idList.default([]),
  lockedBlockIds: idList.default([]),
  lockedPropertyNames: propertyList.default([]),
  protectedTheme: z.boolean().default(false),
  protectedVisibility: z.boolean().default(false),
  protectedOrder: z.boolean().default(false)
}).strict();
export type TemplateLockPolicy = z.infer<typeof templateLockPolicySchema>;
export type LockViolation = { code: 'INVALID_POLICY' | 'FORGED_ID' | 'LOCKED_PROPERTY' | 'LOCKED_STRUCTURE'; path: string; message: string };
export type LockCheck = { ok: true; value: unknown } | { ok: false; violations: LockViolation[] };

type RecordValue = Record<string, unknown>;
type LocatedValue = { path: string; value: unknown };

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** JSON comparison with object-key order removed. Arrays intentionally retain order. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function collectById(value: unknown, path = '', result = new Map<string, { value: RecordValue; path: string }>()): Map<string, { value: RecordValue; path: string }> {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectById(item, `${path}[${index}]`, result));
  } else if (isRecord(value)) {
    if (typeof value.id === 'string') result.set(value.id, { value, path: path || 'id' });
    for (const [key, child] of Object.entries(value)) collectById(child, path ? `${path}.${key}` : key, result);
  }
  return result;
}

function collectProperty(value: unknown, property: string, path = '', result: LocatedValue[] = []): LocatedValue[] {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectProperty(item, property, `${path}[${index}]`, result));
  } else if (isRecord(value)) {
    if (Object.prototype.hasOwnProperty.call(value, property)) result.push({ path: path ? `${path}.${property}` : property, value: value[property] });
    for (const [key, child] of Object.entries(value)) collectProperty(child, property, path ? `${path}.${key}` : key, result);
  }
  return result;
}

function propertyValues(value: unknown, property: string): Map<string, unknown> {
  return new Map(collectProperty(value, property).map(({ path, value: found }) => [path, found]));
}

function orderValues(value: unknown, path = '', result: LocatedValue[] = []): LocatedValue[] {
  if (Array.isArray(value)) {
    const key = path.split('.').pop() ?? '';
    if (key === 'pages' || key === 'regions' || key === 'blocks') {
      result.push({ path, value: value.map((item) => isRecord(item) ? item.id : item) });
    }
    value.forEach((item, index) => orderValues(item, `${path}[${index}]`, result));
  } else if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) orderValues(child, path ? `${path}.${key}` : key, result);
  }
  return result;
}


function changedPaths(base: unknown, proposed: unknown, path = '', result: string[] = []): string[] {
  if (stableJson(base) === stableJson(proposed)) return result;
  if (Array.isArray(base) || Array.isArray(proposed)) {
    const before = Array.isArray(base) ? base : [];
    const after = Array.isArray(proposed) ? proposed : [];
    const beforeIds = before.map((item) => isRecord(item) && typeof item.id === 'string' ? item.id : undefined);
    const afterIds = after.map((item) => isRecord(item) && typeof item.id === 'string' ? item.id : undefined);
    if (stableJson(beforeIds) !== stableJson(afterIds)) result.push(path);
    const length = Math.max(before.length, after.length);
    for (let index = 0; index < length; index++) changedPaths(before[index], after[index], `${path}[${index}]`, result);
    return result;
  }
  if (isRecord(base) || isRecord(proposed)) {
    const before = isRecord(base) ? base : {};
    const after = isRecord(proposed) ? proposed : {};
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) changedPaths(before[key], after[key], path ? `${path}.${key}` : key, result);
    return result;
  }
  result.push(path);
  return result;
}

function isStylePath(path: string): boolean {
  const key = path.split('.').pop()?.replace(/\[\d+\]$/, '') ?? '';
  return key === 'theme' || key === 'style' || key === 'styles' || /(color|font|background|border|spacing|padding|margin|radius|opacity|width|size|alignment|align|format)/i.test(key);
}

function isContentPath(path: string): boolean {
  const key = path.split('.').pop()?.replace(/\[\d+\]$/, '') ?? '';
  return key === 'content' || key === 'config' || key === 'metadata' || key === 'text' || key === 'title' || key === 'body' || key === 'value';
}

function isStructurePath(path: string): boolean {
  const key = path.split('.').pop()?.replace(/\[\d+\]$/, '') ?? '';
  return key === 'pages' || key === 'regions' || key === 'blocks' || key === 'id' || key === 'paper' || key === 'orientation' || key === 'fold' || key === 'ratio' || key === 'gutter' || key === 'order' || key === 'position' || key === 'width' || key === 'type' || key === 'dataMode';
}

function modeAllowsChanges(mode: TemplateLockPolicy['mode'], path: string): boolean {
  if (mode === 'UNLOCKED') return true;
  const style = isStylePath(path);
  const structure = isStructurePath(path);
  const content = isContentPath(path);
  if (mode === 'STYLE_LOCKED') return !style && !structure;
  if (mode === 'STRUCTURE_LOCKED') return !structure;
  if (mode === 'CONTENT_ONLY') return content;
  const exhaustive: never = mode;
  return exhaustive;
}

function violation(code: LockViolation['code'], path: string, message: string): LockViolation {
  return { code, path, message };
}

export function parseTemplateLockPolicy(input: unknown): TemplateLockPolicy {
  return templateLockPolicySchema.parse(input);
}

export function checkTemplateLocks(base: unknown, proposed: unknown, inputPolicy: unknown): LockCheck {
  const parsed = templateLockPolicySchema.safeParse(inputPolicy);
  if (!parsed.success) return { ok: false, violations: [violation('INVALID_POLICY', 'lock', 'Invalid lock policy')] };
  if (!isRecord(base) || !isRecord(proposed)) return { ok: false, violations: [violation('FORGED_ID', '', 'Layouts must be objects')] };

  const policy = parsed.data;
  const violations: LockViolation[] = [];
  const baseIds = collectById(base);
  const proposedIds = collectById(proposed);
  const baseIdCounts = new Map<string, number>();
  const proposedIdCounts = new Map<string, number>();

  const countIds = (value: unknown, counts: Map<string, number>): void => {
    if (Array.isArray(value)) value.forEach((item) => countIds(item, counts));
    else if (isRecord(value)) {
      if (typeof value.id === 'string') counts.set(value.id, (counts.get(value.id) ?? 0) + 1);
      Object.values(value).forEach((child) => countIds(child, counts));
    }
  };
  countIds(base, baseIdCounts);
  countIds(proposed, proposedIdCounts);

  for (const [id, count] of baseIdCounts) {
    if (count !== 1 || proposedIdCounts.get(id) !== 1) violations.push(violation('FORGED_ID', id, 'Stable IDs must occur exactly once'));
  }
  for (const [id, entry] of proposedIds) {
    if (!baseIds.has(id)) violations.push(violation('FORGED_ID', entry.path, 'Unknown IDs cannot be introduced'));
  }

  for (const path of changedPaths(base, proposed)) {
    if (!modeAllowsChanges(policy.mode, path)) violations.push(violation('LOCKED_STRUCTURE', path, `${policy.mode} does not allow this change`));
  }

  if (policy.protectedTheme && stableJson(base.theme) !== stableJson(proposed.theme)) violations.push(violation('LOCKED_PROPERTY', 'theme', 'Theme is protected'));
  if (policy.protectedVisibility) {
    const before = propertyValues(base, 'visibility');
    const after = propertyValues(proposed, 'visibility');
    if (stableJson([...before]) !== stableJson([...after])) violations.push(violation('LOCKED_PROPERTY', 'visibility', 'Visibility is protected'));
  }
  if (policy.protectedOrder) {
    if (stableJson(orderValues(base)) !== stableJson(orderValues(proposed))) violations.push(violation('LOCKED_PROPERTY', 'order', 'Order is protected'));
  }
  for (const property of policy.lockedPropertyNames) {
    if (stableJson([...propertyValues(base, property)]) !== stableJson([...propertyValues(proposed, property)])) violations.push(violation('LOCKED_PROPERTY', property, `${property} is locked`));
  }

  for (const [name, ids] of [['pages', policy.lockedPageIds], ['regions', policy.lockedRegionIds], ['blocks', policy.lockedBlockIds] as const]) {
    for (const id of ids) {
      const before = baseIds.get(id)?.value;
      const after = proposedIds.get(id)?.value;
      if (!before || !after) violations.push(violation('FORGED_ID', `${name}.${id}`, 'Locked identity is missing or changed'));
      else if (stableJson(before) !== stableJson(after)) violations.push(violation('LOCKED_STRUCTURE', `${name}.${id}`, 'Locked structure changed'));
    }
  }

  return violations.length ? { ok: false, violations } : { ok: true, value: proposed };
}
