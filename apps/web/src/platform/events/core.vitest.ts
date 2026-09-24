import { describe, expect, it } from 'vitest';

import { isCoreEventPayload } from './core';

const ids = {
  wardId: '11111111-1111-4111-8111-111111111111',
  actorId: '22222222-2222-4222-8222-222222222222',
  meetingId: '33333333-3333-4333-8333-333333333333'
};

function meetingCreated(overrides: Record<string, unknown> = {}) {
  return {
    type: 'MeetingCreated',
    version: 1,
    ...ids,
    occurredAt: '2024-02-29T23:59:59.123456Z',
    meetingDate: '2024-02-29',
    meetingType: 'SACRAMENT',
    ...overrides
  };
}

describe('Core event payload validation', () => {
  it.each(['2024-02-30', '2023-02-29', '2024-04-31', '2024-00-01', '2024-01-00'])('rejects invalid calendar date %s', (meetingDate) => {
    expect(isCoreEventPayload(meetingCreated({ meetingDate }))).toBe(false);
  });

  it('accepts leap-day boundaries only in leap years', () => {
    expect(isCoreEventPayload(meetingCreated({ meetingDate: '2024-02-29' }))).toBe(true);
    expect(isCoreEventPayload(meetingCreated({ meetingDate: '2025-02-28' }))).toBe(true);
    expect(isCoreEventPayload(meetingCreated({ meetingDate: '2025-02-29' }))).toBe(false);
  });

  it('rejects timestamps whose parsed components do not match the source', () => {
    expect(isCoreEventPayload(meetingCreated({ occurredAt: '2024-02-30T00:00:00.000Z' }))).toBe(false);
    expect(isCoreEventPayload(meetingCreated({ occurredAt: '2024-01-01T24:00:00.000Z' }))).toBe(false);
    expect(isCoreEventPayload(meetingCreated({ occurredAt: '2024-01-01T00:60:00.000Z' }))).toBe(false);
  });

  it('accepts up to six fractional-second digits and rejects longer fractions', () => {
    expect(isCoreEventPayload(meetingCreated({ occurredAt: '2024-02-29T23:59:59.123456Z' }))).toBe(true);
    expect(isCoreEventPayload(meetingCreated({ occurredAt: '2024-02-29T23:59:59.1234567Z' }))).toBe(false);
  });
});
