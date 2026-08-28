import type { PoolClient } from 'pg';

import { hasRole } from '@/src/auth/roles';

import {
  NOTIFICATION_EVENT_TYPES,
  getNotificationEventDefinition,
  type NotificationEventType
} from './events';

type DbClient = Pick<PoolClient, 'query'>;

export type RecipientPolicyKey =
  | 'CALLING_MANAGERS'
  | 'MEMBERSHIP_VIEWERS'
  | 'MEETING_VIEWERS'
  | 'INTERNAL_NOTE_READERS'
  | 'ACCESS_ADMINISTRATORS'
  | 'NO_DEFAULT_RECIPIENTS';

export type RecipientPolicyContext = {
  wardId: string;
  eventType: NotificationEventType;
  actorUserId?: string;
  explicitUserIds?: string[];
};

const CALLING_EVENTS = new Set<NotificationEventType>([
  'CALLING_SUGGESTED',
  'CALLING_PROPOSAL_ACCEPTED',
  'CALLING_PROPOSAL_DECLINED',
  'CALLING_EXTENDED',
  'CALLING_SUSTAINED',
  'CALLING_SET_APART',
  'CALLING_RELEASED',
  'CALLING_ASSIGNMENT_CHANGED',
  'CALLING_REQUIRES_FOLLOW_UP'
]);

const MEMBERSHIP_EVENTS = new Set<NotificationEventType>([
  'MEMBER_ADDED',
  'MEMBER_UPDATED',
  'MEMBER_ARCHIVED',
  'MEMBER_REACTIVATED',
  'MEMBERSHIP_IMPORT_COMPLETED',
  'MEMBERSHIP_IMPORT_FAILED',
  'CALLING_IMPORT_COMPLETED',
  'CALLING_IMPORT_FAILED',
  'MEMBER_DUPLICATE_DETECTED',
  'MEMBER_MATCH_FAILED'
]);

const MEETING_EVENTS = new Set<NotificationEventType>([
  'MEETING_CREATED',
  'MEETING_UPDATED',
  'MEETING_PUBLISHED',
  'MEETING_REPUBLISHED',
  'MEETING_COMPLETED',
  'MEETING_PROGRAM_ITEM_CHANGED',
  'MEETING_BUSINESS_LINE_ADDED',
  'MEETING_MISSING_REQUIRED_INFORMATION'
]);

const NOTE_EVENTS = new Set<NotificationEventType>([
  'NOTE_CREATED',
  'NOTE_UPDATED',
  'NOTE_MENTIONED',
  'COMMENT_CREATED',
  'COMMENT_UPDATED'
]);

const ACCESS_EVENTS = new Set<NotificationEventType>([
  'ACCESS_REQUEST_SUBMITTED',
  'ACCESS_REQUEST_APPROVED',
  'ACCESS_REQUEST_DENIED',
  'WARD_ACCESS_GRANTED',
  'WARD_ACCESS_CHANGED',
  'WARD_ACCESS_REVOKED'
]);

export function getRecipientPolicyKey(eventType: NotificationEventType): RecipientPolicyKey {
  if (CALLING_EVENTS.has(eventType)) return 'CALLING_MANAGERS';
  if (MEMBERSHIP_EVENTS.has(eventType)) return 'MEMBERSHIP_VIEWERS';
  if (MEETING_EVENTS.has(eventType)) return 'MEETING_VIEWERS';
  if (NOTE_EVENTS.has(eventType)) return 'INTERNAL_NOTE_READERS';
  if (ACCESS_EVENTS.has(eventType)) return 'ACCESS_ADMINISTRATORS';
  return 'NO_DEFAULT_RECIPIENTS';
}

export function getRecipientRoles(policy: RecipientPolicyKey): readonly string[] {
  switch (policy) {
    case 'CALLING_MANAGERS':
      return ['STAND_ADMIN', 'BISHOPRIC_EDITOR', 'CLERK_EDITOR'];
    case 'MEMBERSHIP_VIEWERS':
      return ['STAND_ADMIN', 'BISHOPRIC_EDITOR', 'CLERK_EDITOR', 'WARD_CLERK', 'MEMBERSHIP_CLERK'];
    case 'MEETING_VIEWERS':
      return ['STAND_ADMIN', 'BISHOPRIC_EDITOR', 'CLERK_EDITOR', 'WARD_CLERK', 'MEMBERSHIP_CLERK', 'CONDUCTOR_VIEW'];
    case 'INTERNAL_NOTE_READERS':
      return ['STAND_ADMIN', 'BISHOPRIC_EDITOR', 'CLERK_EDITOR', 'WARD_CLERK', 'MEMBERSHIP_CLERK'];
    case 'ACCESS_ADMINISTRATORS':
      return ['STAND_ADMIN'];
    case 'NO_DEFAULT_RECIPIENTS':
      return [];
  }
}

export function getExplicitRecipientIds(context: RecipientPolicyContext): string[] {
  const ids = context.explicitUserIds ?? [];
  return [...new Set(ids.filter((id) => id.trim().length > 0 && id !== context.actorUserId))];
}

export async function resolveNotificationRecipients(
  client: DbClient,
  context: RecipientPolicyContext
): Promise<string[]> {
  const policy = getRecipientPolicyKey(context.eventType);
  const roles = getRecipientRoles(policy);
  const explicitIds = getExplicitRecipientIds(context);

  if (roles.length === 0 && explicitIds.length === 0) {
    return [];
  }

  const values: unknown[] = [context.wardId];
  const rolePlaceholders = roles.map((role) => {
    values.push(role);
    return `$${values.length}::text`;
  });
  const explicitPlaceholders = explicitIds.map((userId) => {
    values.push(userId);
    return `$${values.length}::uuid`;
  });
  const conditions: string[] = [];

  if (rolePlaceholders.length > 0) {
    conditions.push(`r.name IN (${rolePlaceholders.join(', ')})`);
  }
  if (explicitPlaceholders.length > 0) {
    conditions.push(`wur.user_id IN (${explicitPlaceholders.join(', ')})`);
  }
  if (context.actorUserId) {
    values.push(context.actorUserId);
  }

  const actorCondition = context.actorUserId ? `AND wur.user_id <> $${values.length}::uuid` : '';
  const result = await client.query(
    `SELECT DISTINCT wur.user_id
       FROM ward_user_role wur
       JOIN role r ON r.id = wur.role_id
      WHERE wur.ward_id = $1::uuid
        AND wur.revoked_at IS NULL
        AND (wur.expires_at IS NULL OR wur.expires_at > now())
        AND (${conditions.join(' OR ')})
        ${actorCondition}
      ORDER BY wur.user_id`,
    values
  );

  return (result.rows as Array<{ user_id: string }>).map((row) => row.user_id);
}

export function isKnownNotificationEvent(eventType: string): eventType is NotificationEventType {
  return NOTIFICATION_EVENT_TYPES.includes(eventType as NotificationEventType);
}

export function isEventInCategory(eventType: NotificationEventType, category: string): boolean {
  return getNotificationEventDefinition(eventType).category === category;
}

export function canActorReceiveOwnNotification(params: { eventType: NotificationEventType; actorUserId: string; recipientUserId: string }): boolean {
  return params.actorUserId !== params.recipientUserId;
}

export { CALLING_EVENTS, MEMBERSHIP_EVENTS, MEETING_EVENTS, NOTE_EVENTS, ACCESS_EVENTS };
