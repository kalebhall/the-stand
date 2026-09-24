import { redirect } from 'next/navigation';

import { isWardModuleEnabled } from './service';

export async function requireWardModuleEnabled(
  wardId: string,
  userId: string,
  moduleId: string,
  redirectTo: string
): Promise<true> {
  if (!(await isWardModuleEnabled(wardId, userId, moduleId))) {
    redirect(redirectTo);
  }

  return true;
}
