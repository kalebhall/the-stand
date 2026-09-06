export const NOTIFICATION_CATEGORIES = [
  'CALLINGS',
  'MEMBERSHIP',
  'MEETINGS',
  'NOTES',
  'ANNOUNCEMENTS',
  'CALENDAR',
  'ACCESS',
  'SYSTEM',
  'REMINDERS'
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
export type NotificationChannel = 'IN_APP' | 'EMAIL';
export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error';

export const NOTIFICATION_EVENT_TYPES = [
  'CALLING_SUGGESTED',
  'CALLING_PROPOSAL_ACCEPTED',
  'CALLING_PROPOSAL_DECLINED',
  'CALLING_EXTENDED',
  'CALLING_SUSTAINED',
  'CALLING_SET_APART',
  'CALLING_RELEASED',
  'CALLING_ASSIGNMENT_CHANGED',
  'CALLING_REQUIRES_FOLLOW_UP',
  'MEMBER_ADDED',
  'MEMBER_UPDATED',
  'MEMBER_ARCHIVED',
  'MEMBER_REACTIVATED',
  'MEMBERSHIP_IMPORT_COMPLETED',
  'MEMBERSHIP_IMPORT_FAILED',
  'CALLING_IMPORT_COMPLETED',
  'CALLING_IMPORT_FAILED',
  'MEMBER_DUPLICATE_DETECTED',
  'MEMBER_MATCH_FAILED',
  'MEETING_CREATED',
  'MEETING_UPDATED',
  'MEETING_PUBLISHED',
  'MEETING_REPUBLISHED',
  'MEETING_COMPLETED',
  'MEETING_PROGRAM_ITEM_CHANGED',
  'MEETING_BUSINESS_LINE_ADDED',
  'MEETING_MISSING_REQUIRED_INFORMATION',
  'NOTE_CREATED',
  'NOTE_UPDATED',
  'NOTE_MENTIONED',
  'COMMENT_CREATED',
  'COMMENT_UPDATED',
  'ANNOUNCEMENT_CREATED',
  'ANNOUNCEMENT_UPDATED',
  'ANNOUNCEMENT_PUBLISHED',
  'ANNOUNCEMENT_EXPIRED',
  'CALENDAR_EVENT_IMPORTED',
  'CALENDAR_EVENT_CHANGED',
  'CALENDAR_IMPORT_FAILED',
  'ACCESS_REQUEST_SUBMITTED',
  'ACCESS_REQUEST_APPROVED',
  'ACCESS_REQUEST_DENIED',
  'WARD_ACCESS_GRANTED',
  'WARD_ACCESS_CHANGED',
  'WARD_ACCESS_REVOKED',
  'SUPPORT_ACCESS_STARTED',
  'SUPPORT_ACCESS_ENDED',
  'SYSTEM_FAILURE',
  'NOTIFICATION_DELIVERY_FAILED',
  'MEETING_NOT_PUBLISHED_REMINDER',
  'MEETING_PREPARATION_REMINDER',
  'CALLING_ACTION_PENDING_REMINDER',
  'MEMBERSHIP_ORDINANCE_ACTION_NEEDED_REMINDER',
  'MEMBERSHIP_ORDINANCE_LCR_NEEDED_REMINDER',
  'ANNOUNCEMENT_EXPIRING_REMINDER',
  'CALENDAR_SYNC_OVERDUE_REMINDER',
  'INTERVIEW_REMINDER'
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export type NotificationEventDefinition = {
  eventType: NotificationEventType;
  category: NotificationCategory;
  label: string;
  defaultChannels: NotificationChannel[];
  severity: NotificationSeverity;
};

type EventDefinitionInput = Omit<NotificationEventDefinition, 'eventType'>;

const inApp: NotificationChannel[] = ['IN_APP'];
const inAppAndEmail: NotificationChannel[] = ['IN_APP', 'EMAIL'];

const definition = (eventType: NotificationEventType, values: EventDefinitionInput): NotificationEventDefinition => ({
  eventType,
  ...values
});

const EVENT_DEFINITIONS: Record<NotificationEventType, NotificationEventDefinition> = {
  CALLING_SUGGESTED: definition('CALLING_SUGGESTED', {
    category: 'CALLINGS',
    label: 'Calling suggested',
    defaultChannels: inAppAndEmail,
    severity: 'info'
  }),
  CALLING_PROPOSAL_ACCEPTED: definition('CALLING_PROPOSAL_ACCEPTED', {
    category: 'CALLINGS',
    label: 'Calling proposal accepted',
    defaultChannels: inApp,
    severity: 'success'
  }),
  CALLING_PROPOSAL_DECLINED: definition('CALLING_PROPOSAL_DECLINED', {
    category: 'CALLINGS',
    label: 'Calling proposal declined',
    defaultChannels: inApp,
    severity: 'warning'
  }),
  CALLING_EXTENDED: definition('CALLING_EXTENDED', {
    category: 'CALLINGS',
    label: 'Calling extended',
    defaultChannels: inApp,
    severity: 'info'
  }),
  CALLING_SUSTAINED: definition('CALLING_SUSTAINED', {
    category: 'CALLINGS',
    label: 'Calling sustained',
    defaultChannels: inAppAndEmail,
    severity: 'success'
  }),
  CALLING_SET_APART: definition('CALLING_SET_APART', {
    category: 'CALLINGS',
    label: 'Calling set apart',
    defaultChannels: inAppAndEmail,
    severity: 'success'
  }),
  CALLING_RELEASED: definition('CALLING_RELEASED', {
    category: 'CALLINGS',
    label: 'Calling released',
    defaultChannels: inAppAndEmail,
    severity: 'info'
  }),
  CALLING_ASSIGNMENT_CHANGED: definition('CALLING_ASSIGNMENT_CHANGED', {
    category: 'CALLINGS',
    label: 'Calling assignment changed',
    defaultChannels: inApp,
    severity: 'info'
  }),
  CALLING_REQUIRES_FOLLOW_UP: definition('CALLING_REQUIRES_FOLLOW_UP', {
    category: 'CALLINGS',
    label: 'Calling requires follow-up',
    defaultChannels: inApp,
    severity: 'warning'
  }),
  MEMBER_ADDED: definition('MEMBER_ADDED', { category: 'MEMBERSHIP', label: 'Member added', defaultChannels: inApp, severity: 'info' }),
  MEMBER_UPDATED: definition('MEMBER_UPDATED', {
    category: 'MEMBERSHIP',
    label: 'Member information updated',
    defaultChannels: inApp,
    severity: 'info'
  }),
  MEMBER_ARCHIVED: definition('MEMBER_ARCHIVED', {
    category: 'MEMBERSHIP',
    label: 'Member archived',
    defaultChannels: inApp,
    severity: 'info'
  }),
  MEMBER_REACTIVATED: definition('MEMBER_REACTIVATED', {
    category: 'MEMBERSHIP',
    label: 'Member reactivated',
    defaultChannels: inApp,
    severity: 'info'
  }),
  MEMBERSHIP_IMPORT_COMPLETED: definition('MEMBERSHIP_IMPORT_COMPLETED', {
    category: 'MEMBERSHIP',
    label: 'Membership import completed',
    defaultChannels: inApp,
    severity: 'success'
  }),
  MEMBERSHIP_IMPORT_FAILED: definition('MEMBERSHIP_IMPORT_FAILED', {
    category: 'MEMBERSHIP',
    label: 'Membership import failed',
    defaultChannels: inAppAndEmail,
    severity: 'error'
  }),
  CALLING_IMPORT_COMPLETED: definition('CALLING_IMPORT_COMPLETED', {
    category: 'MEMBERSHIP',
    label: 'Calling import completed',
    defaultChannels: inApp,
    severity: 'success'
  }),
  CALLING_IMPORT_FAILED: definition('CALLING_IMPORT_FAILED', {
    category: 'MEMBERSHIP',
    label: 'Calling import failed',
    defaultChannels: inAppAndEmail,
    severity: 'error'
  }),
  MEMBER_DUPLICATE_DETECTED: definition('MEMBER_DUPLICATE_DETECTED', {
    category: 'MEMBERSHIP',
    label: 'Possible duplicate member detected',
    defaultChannels: inApp,
    severity: 'warning'
  }),
  MEMBER_MATCH_FAILED: definition('MEMBER_MATCH_FAILED', {
    category: 'MEMBERSHIP',
    label: 'Member match failed',
    defaultChannels: inApp,
    severity: 'warning'
  }),
  MEETING_CREATED: definition('MEETING_CREATED', {
    category: 'MEETINGS',
    label: 'Meeting created',
    defaultChannels: inApp,
    severity: 'info'
  }),
  MEETING_UPDATED: definition('MEETING_UPDATED', {
    category: 'MEETINGS',
    label: 'Meeting changed',
    defaultChannels: inApp,
    severity: 'info'
  }),
  MEETING_PUBLISHED: definition('MEETING_PUBLISHED', {
    category: 'MEETINGS',
    label: 'Meeting published',
    defaultChannels: inAppAndEmail,
    severity: 'info'
  }),
  MEETING_REPUBLISHED: definition('MEETING_REPUBLISHED', {
    category: 'MEETINGS',
    label: 'Meeting republished',
    defaultChannels: inAppAndEmail,
    severity: 'info'
  }),
  MEETING_COMPLETED: definition('MEETING_COMPLETED', {
    category: 'MEETINGS',
    label: 'Meeting completed',
    defaultChannels: inApp,
    severity: 'success'
  }),
  MEETING_PROGRAM_ITEM_CHANGED: definition('MEETING_PROGRAM_ITEM_CHANGED', {
    category: 'MEETINGS',
    label: 'Meeting program item changed',
    defaultChannels: inApp,
    severity: 'info'
  }),
  MEETING_BUSINESS_LINE_ADDED: definition('MEETING_BUSINESS_LINE_ADDED', {
    category: 'MEETINGS',
    label: 'Meeting business added',
    defaultChannels: inApp,
    severity: 'info'
  }),
  MEETING_MISSING_REQUIRED_INFORMATION: definition('MEETING_MISSING_REQUIRED_INFORMATION', {
    category: 'MEETINGS',
    label: 'Meeting needs attention',
    defaultChannels: inApp,
    severity: 'warning'
  }),
  NOTE_CREATED: definition('NOTE_CREATED', { category: 'NOTES', label: 'Note added', defaultChannels: inApp, severity: 'info' }),
  NOTE_UPDATED: definition('NOTE_UPDATED', { category: 'NOTES', label: 'Note updated', defaultChannels: inApp, severity: 'info' }),
  NOTE_MENTIONED: definition('NOTE_MENTIONED', {
    category: 'NOTES',
    label: 'You were mentioned in a note',
    defaultChannels: inAppAndEmail,
    severity: 'info'
  }),
  COMMENT_CREATED: definition('COMMENT_CREATED', { category: 'NOTES', label: 'Comment added', defaultChannels: inApp, severity: 'info' }),
  COMMENT_UPDATED: definition('COMMENT_UPDATED', { category: 'NOTES', label: 'Comment updated', defaultChannels: inApp, severity: 'info' }),
  ANNOUNCEMENT_CREATED: definition('ANNOUNCEMENT_CREATED', {
    category: 'ANNOUNCEMENTS',
    label: 'Announcement created',
    defaultChannels: inApp,
    severity: 'info'
  }),
  ANNOUNCEMENT_UPDATED: definition('ANNOUNCEMENT_UPDATED', {
    category: 'ANNOUNCEMENTS',
    label: 'Announcement updated',
    defaultChannels: inApp,
    severity: 'info'
  }),
  ANNOUNCEMENT_PUBLISHED: definition('ANNOUNCEMENT_PUBLISHED', {
    category: 'ANNOUNCEMENTS',
    label: 'Announcement published',
    defaultChannels: inApp,
    severity: 'info'
  }),
  ANNOUNCEMENT_EXPIRED: definition('ANNOUNCEMENT_EXPIRED', {
    category: 'ANNOUNCEMENTS',
    label: 'Announcement expired',
    defaultChannels: inApp,
    severity: 'info'
  }),
  CALENDAR_EVENT_IMPORTED: definition('CALENDAR_EVENT_IMPORTED', {
    category: 'CALENDAR',
    label: 'Calendar event imported',
    defaultChannels: inApp,
    severity: 'info'
  }),
  CALENDAR_EVENT_CHANGED: definition('CALENDAR_EVENT_CHANGED', {
    category: 'CALENDAR',
    label: 'Calendar event changed',
    defaultChannels: inApp,
    severity: 'info'
  }),
  CALENDAR_IMPORT_FAILED: definition('CALENDAR_IMPORT_FAILED', {
    category: 'CALENDAR',
    label: 'Calendar import failed',
    defaultChannels: inAppAndEmail,
    severity: 'error'
  }),
  ACCESS_REQUEST_SUBMITTED: definition('ACCESS_REQUEST_SUBMITTED', {
    category: 'ACCESS',
    label: 'Access request submitted',
    defaultChannels: inAppAndEmail,
    severity: 'info'
  }),
  ACCESS_REQUEST_APPROVED: definition('ACCESS_REQUEST_APPROVED', {
    category: 'ACCESS',
    label: 'Access request approved',
    defaultChannels: inAppAndEmail,
    severity: 'success'
  }),
  ACCESS_REQUEST_DENIED: definition('ACCESS_REQUEST_DENIED', {
    category: 'ACCESS',
    label: 'Access request denied',
    defaultChannels: inAppAndEmail,
    severity: 'warning'
  }),
  WARD_ACCESS_GRANTED: definition('WARD_ACCESS_GRANTED', {
    category: 'ACCESS',
    label: 'Ward access granted',
    defaultChannels: inAppAndEmail,
    severity: 'success'
  }),
  WARD_ACCESS_CHANGED: definition('WARD_ACCESS_CHANGED', {
    category: 'ACCESS',
    label: 'Ward access changed',
    defaultChannels: inAppAndEmail,
    severity: 'info'
  }),
  WARD_ACCESS_REVOKED: definition('WARD_ACCESS_REVOKED', {
    category: 'ACCESS',
    label: 'Ward access revoked',
    defaultChannels: inAppAndEmail,
    severity: 'warning'
  }),
  SUPPORT_ACCESS_STARTED: definition('SUPPORT_ACCESS_STARTED', {
    category: 'ACCESS',
    label: 'Support access started',
    defaultChannels: inApp,
    severity: 'info'
  }),
  SUPPORT_ACCESS_ENDED: definition('SUPPORT_ACCESS_ENDED', {
    category: 'ACCESS',
    label: 'Support access ended',
    defaultChannels: inApp,
    severity: 'info'
  }),
  SYSTEM_FAILURE: definition('SYSTEM_FAILURE', {
    category: 'SYSTEM',
    label: 'System failure',
    defaultChannels: inAppAndEmail,
    severity: 'error'
  }),
  NOTIFICATION_DELIVERY_FAILED: definition('NOTIFICATION_DELIVERY_FAILED', {
    category: 'SYSTEM',
    label: 'Notification delivery failed',
    defaultChannels: inAppAndEmail,
    severity: 'error'
  }),
  MEETING_NOT_PUBLISHED_REMINDER: definition('MEETING_NOT_PUBLISHED_REMINDER', {
    category: 'REMINDERS',
    label: 'Meeting has not been published',
    defaultChannels: inApp,
    severity: 'warning'
  }),
  MEETING_PREPARATION_REMINDER: definition('MEETING_PREPARATION_REMINDER', {
    category: 'REMINDERS',
    label: 'Meeting preparation reminder',
    defaultChannels: inApp,
    severity: 'warning'
  }),
  CALLING_ACTION_PENDING_REMINDER: definition('CALLING_ACTION_PENDING_REMINDER', {
    category: 'REMINDERS',
    label: 'Calling action needs attention',
    defaultChannels: inApp,
    severity: 'warning'
  }),
  MEMBERSHIP_ORDINANCE_ACTION_NEEDED_REMINDER: definition('MEMBERSHIP_ORDINANCE_ACTION_NEEDED_REMINDER', {
    category: 'REMINDERS',
    label: 'Membership or ordinance action needs attention',
    defaultChannels: inApp,
    severity: 'warning'
  }),
  MEMBERSHIP_ORDINANCE_LCR_NEEDED_REMINDER: definition('MEMBERSHIP_ORDINANCE_LCR_NEEDED_REMINDER', {
    category: 'REMINDERS',
    label: 'Priesthood action needs LCR update',
    defaultChannels: inApp,
    severity: 'warning'
  }),
  ANNOUNCEMENT_EXPIRING_REMINDER: definition('ANNOUNCEMENT_EXPIRING_REMINDER', {
    category: 'REMINDERS',
    label: 'Announcement is expiring',
    defaultChannels: inApp,
    severity: 'warning'
  }),
  CALENDAR_SYNC_OVERDUE_REMINDER: definition('CALENDAR_SYNC_OVERDUE_REMINDER', {
    category: 'REMINDERS',
    label: 'Calendar sync is overdue',
    defaultChannels: inApp,
    severity: 'warning'
  }),
  INTERVIEW_REMINDER: definition('INTERVIEW_REMINDER', {
    category: 'REMINDERS',
    label: 'Scheduled interview reminder',
    defaultChannels: inApp,
    severity: 'warning'
  })
};

export function getNotificationEventDefinition(eventType: string): NotificationEventDefinition {
  const eventDefinition = EVENT_DEFINITIONS[eventType as NotificationEventType];

  if (!eventDefinition) {
    throw new Error(`Unknown notification event type: ${eventType}`);
  }

  return eventDefinition;
}
