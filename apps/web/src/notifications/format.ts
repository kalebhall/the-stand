import { getNotificationEventDefinition, type NotificationEventType, type NotificationSeverity } from './events';
import type { CreateUserNotificationInput } from './user-notifications';

type FormatEventInput = {
  wardId: string;
  sourceEventId: string;
  eventType: NotificationEventType;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  recipientUserId: string;
};

type SafePayload = Record<string, unknown>;

function asSafePayload(payload: unknown): SafePayload {
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as SafePayload) : {};
}

function approvedTargetUrl(aggregateType: string, aggregateId: string, payload?: SafePayload): string | null {
  if (aggregateType === 'membership_ordinance' && typeof payload?.meetingId === 'string') {
    return `/meetings/${payload.meetingId}/edit`;
  }

  const targets: Record<string, string> = {
    meeting: `/meetings/${aggregateId}/edit`,
    calling: `/callings/${aggregateId}`,
    member: `/members/${aggregateId}`,
    internal_note: '/notes',
    note: '/notes',
    announcement: '/announcements',
    calendar_event: '/calendar',
    access_request: '/support/access-requests'
  };
  return targets[aggregateType] ?? null;
}

function safeSummary(definition: ReturnType<typeof getNotificationEventDefinition>, payload: SafePayload): string {
  const subject = typeof payload.subject === 'string' ? payload.subject.trim() : '';
  if (subject.length > 0) {
    return `${definition.label}: ${subject}`.slice(0, 500);
  }
  return definition.label;
}

export function formatUserNotification(input: FormatEventInput): CreateUserNotificationInput {
  const definition = getNotificationEventDefinition(input.eventType);
  const payload = asSafePayload(input.payload);
  const detailKeys = ['meetingDate', 'callingName', 'memberName', 'action', 'reason'];
  const details = Object.fromEntries(
    detailKeys
      .filter((key) => typeof payload[key] === 'string' || typeof payload[key] === 'number' || typeof payload[key] === 'boolean')
      .map((key) => [key, payload[key]])
  );

  return {
    wardId: input.wardId,
    recipientUserId: input.recipientUserId,
    sourceEventId: input.sourceEventId,
    eventType: input.eventType,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    title: definition.label,
    summary: safeSummary(definition, payload),
    details,
    severity: definition.severity as NotificationSeverity,
    targetUrl: approvedTargetUrl(input.aggregateType, input.aggregateId, payload)
  };
}

export { approvedTargetUrl };
