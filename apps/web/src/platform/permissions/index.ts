import { assertWardAccess, type WardContext } from '@/src/platform/tenancy/context';

export * from '@/src/auth/roles';

export type PermissionSubject = {
  roles?: string[];
  activeWardId?: string | null;
};

export function canAccessWard(subject: PermissionSubject, wardId: string): boolean {
  return subject.activeWardId === wardId;
}

export function assertPermissionWardAccess(context: WardContext, targetWardId: string): void {
  assertWardAccess(context, targetWardId);
}
