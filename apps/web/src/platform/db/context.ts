import { setDbContext as setExistingDbContext } from '@/src/db/context';
import { assertWardAccess, type WardContext } from '@/src/platform/tenancy/context';

export type { DbContext } from '@/src/db/context';
export { requireWardContext } from '@/src/platform/tenancy/context';

export async function setDbContext(client: Parameters<typeof setExistingDbContext>[0], context: WardContext): Promise<void> {
  await setExistingDbContext(client, context);
}

export async function setDbContextForWard(
  client: Parameters<typeof setExistingDbContext>[0],
  context: WardContext,
  targetWardId: string
): Promise<void> {
  assertWardAccess(context, targetWardId);
  await setExistingDbContext(client, context);
}
