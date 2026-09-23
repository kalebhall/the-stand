import { getWardFeatureFlags, isWardFeatureEnabled } from '@/src/features/flags';
import type { WardFeature, WardFeatureFlags } from '@/src/features/types';
import { assertWardAccess, type WardContext } from '@/src/platform/tenancy/context';

export { DEFAULT_WARD_FEATURE_FLAGS, WARD_FEATURES, WARD_FEATURE_LABELS, featureIsEnabled } from '@/src/features/flags';
export type { WardFeature, WardFeatureFlags } from '@/src/features/types';

export { getWardFeatureFlags, isWardFeatureEnabled };

export async function getContextFeatureFlags(context: WardContext, targetWardId: string): Promise<WardFeatureFlags> {
  assertWardAccess(context, targetWardId);
  return getWardFeatureFlags(context.wardId, context.userId);
}

export async function isContextFeatureEnabled(
  context: WardContext,
  targetWardId: string,
  feature: WardFeature
): Promise<boolean> {
  assertWardAccess(context, targetWardId);
  return isWardFeatureEnabled(context.wardId, context.userId, feature);
}
