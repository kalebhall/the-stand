export type MeetingCreated = {
  type: 'MeetingCreated';
  version: 1;
  wardId: string;
  actorId: string;
  meetingId: string;
  occurredAt: string;
  meetingDate: string;
  meetingType: string;
};

export type MeetingCompleted = {
  type: 'MeetingCompleted';
  version: 1;
  wardId: string;
  actorId: string;
  meetingId: string;
  occurredAt: string;
};

export type CoreEvent = MeetingCreated | MeetingCompleted;

function isValidCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() + 1 === Number(match[2]) && date.getUTCDate() === Number(match[3]);
}

function isValidIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?Z$/.exec(value);
  if (!match) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    && date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() + 1 === Number(match[2])
    && date.getUTCDate() === Number(match[3])
    && date.getUTCHours() === Number(match[4])
    && date.getUTCMinutes() === Number(match[5])
    && date.getUTCSeconds() === Number(match[6]);
}

export function isCoreEventPayload(value: unknown): value is CoreEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<CoreEvent>;
  const uuid = (candidate: unknown): candidate is string => typeof candidate === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate);
  const meetingType = (candidate: unknown): candidate is string => typeof candidate === 'string' && candidate.length > 0 && candidate.length <= 100;

  if (event.version !== 1 || !uuid(event.wardId) || !uuid(event.actorId) || !uuid(event.meetingId) || !isValidIsoTimestamp(event.occurredAt)) return false;
  if (event.type === 'MeetingCreated') return isValidCalendarDate(event.meetingDate) && meetingType(event.meetingType);
  return event.type === 'MeetingCompleted';
}

export function isCoreEvent(value: CoreEvent, type: CoreEvent['type']): boolean {
  return value.type === type;
}