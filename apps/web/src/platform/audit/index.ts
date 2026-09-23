import { buildFieldDiff, recordAuditEvent, redactSensitiveData, type AuditEventParams } from '@/src/audit/service';
import { assertWardAccess, type WardContext } from '@/src/platform/tenancy/context';

export { buildFieldDiff, recordAuditEvent, redactSensitiveData };
export type { AuditEntityType, AuditEventParams, AuditSeverity, AuditSource } from '@/src/audit/service';

export async function recordWardAuditEvent(
  client: Parameters<typeof recordAuditEvent>[0],
  context: WardContext,
  event: AuditEventParams
): Promise<void> {
  if (event.wardId) assertWardAccess(context, event.wardId);
  await recordAuditEvent(client, { ...event, wardId: context.wardId, userId: event.userId ?? context.userId });
}
