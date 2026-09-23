import { assertWardAccess, type WardContext } from '@/src/platform/tenancy/context';

export * from '@/src/offline/storage';

export function assertOfflineWardAccess(context: WardContext, targetWardId: string): void {
  assertWardAccess(context, targetWardId);
}
