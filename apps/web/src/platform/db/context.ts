import { setDbContext as setExistingDbContext, type DbContext } from '@/src/db/context';
import { assertWardAccess, type WardContext } from '@/src/platform/tenancy/context';

export type { DbContext };
export { requireWardContext } from '@/src/db/context';

export async function setDbContext(client: Parameters<typeof setExistingDbContext>[0], context: DbContext): Promise<void> {
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
