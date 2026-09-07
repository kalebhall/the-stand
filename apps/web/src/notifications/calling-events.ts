import type { CallingStatus } from '@/src/callings/lifecycle';
import type { NotificationEventType } from './events';

const CALLING_NOTIFICATION_EVENTS: Partial<Record<CallingStatus, NotificationEventType>> = {
  ASSIGNED: 'CALLING_ASSIGNMENT_CHANGED',
  EXTENDED: 'CALLING_EXTENDED',
  SUSTAINED: 'CALLING_SUSTAINED',
  SET_APART: 'CALLING_SET_APART',
  TO_BE_RELEASED: 'CALLING_RELEASED'
};

export function getCallingNotificationEventType(status: CallingStatus): NotificationEventType | null {
  return CALLING_NOTIFICATION_EVENTS[status] ?? null;
}
