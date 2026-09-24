import { buildFieldDiff, recordAuditEvent, redactSensitiveData, type AuditEventParams } from '@/src/audit/service';
import { PLATFORM_ERROR_CODES, PlatformError } from '@/src/platform/errors';
import { assertWardAccess, type WardContext } from '@/src/platform/tenancy/context';

export { buildFieldDiff, redactSensitiveData };
export type { AuditEntityType, AuditEventParams, AuditSeverity, AuditSource } from '@/src/audit/service';

export async function recordWardAuditEvent(
  client: Parameters<typeof recordAuditEvent>[0],
  context: WardContext,
  event: AuditEventParams
): Promise<void> {
  if (event.wardId) assertWardAccess(context, event.wardId);
  if (event.userId && event.userId !== context.userId) {
    throw new PlatformError(PLATFORM_ERROR_CODES.FORBIDDEN, 'Audit actor does not match the authenticated user.', 403);
  }
  await recordAuditEvent(client, { ...event, wardId: context.wardId, userId: context.userId });
}
