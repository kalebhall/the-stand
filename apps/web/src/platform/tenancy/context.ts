import { PLATFORM_ERROR_CODES, PlatformError, wardAccessDenied } from '@/src/platform/errors';

export type WardContext = {
  userId: string;
  wardId: string;
};

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
