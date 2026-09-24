import { PLATFORM_ERROR_CODES, PlatformError, wardAccessDenied } from '@/src/platform/errors';

export type WardContext = {
  userId: string;
  wardId: string;
  activeStakeId?: string | null;
  stakeAssignments?: readonly { stakeId: string; roleNames: readonly string[] }[];
};

type SessionWardIdentity = {
  user: { id?: string | null };
  activeWardId?: string | null;
  activeStakeId?: string | null;
  stakeAssignments?: readonly { stakeId: string; roleNames: readonly string[] }[];
};

export function createWardContext(session: SessionWardIdentity, targetWardId?: string): WardContext {
  const userId = session.user.id?.trim() ?? '';
  const wardId = session.activeWardId?.trim() ?? '';
  if (!userId || !wardId || (targetWardId !== undefined && targetWardId.trim() !== wardId)) {
    throw new PlatformError(
      PLATFORM_ERROR_CODES.WARD_ACCESS_DENIED,
      'The authenticated session is not authorized for this ward.',
      403
    );
  }

  return {
    userId,
    wardId,
    activeStakeId: session.activeStakeId ?? null,
    stakeAssignments: session.stakeAssignments
  };
}

export function requireWardContext(context: WardContext): WardContext {
  const userId = context.userId.trim();
  const wardId = context.wardId.trim();
  if (!userId || !wardId) {
    throw new PlatformError(
      PLATFORM_ERROR_CODES.VALIDATION,
      'User and ward context are required.',
      400
    );
  }
  return { userId, wardId };
}

export function assertWardAccess(context: WardContext, targetWardId: string): void {
  const normalizedTargetWardId = targetWardId.trim();
  if (!normalizedTargetWardId || normalizedTargetWardId !== context.wardId) {
    throw wardAccessDenied(normalizedTargetWardId || targetWardId);
  }
}

export function assertStakeAccess(context: WardContext, targetStakeId: string): void {
  const normalizedTargetStakeId = targetStakeId.trim();
  const hasAssignment = context.stakeAssignments?.some((assignment) => assignment.stakeId === normalizedTargetStakeId) === true;
  if (!normalizedTargetStakeId || (context.activeStakeId !== normalizedTargetStakeId && !hasAssignment)) {
    throw new PlatformError(
      PLATFORM_ERROR_CODES.FORBIDDEN,
      'The authenticated session is not authorized for this stake.',
      403
    );
  }
}
