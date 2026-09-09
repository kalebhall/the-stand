import { describe, expect, it } from 'vitest';

import { isValidLeadershipMeetingPayload } from './bishopric';

describe('isValidLeadershipMeetingPayload', () => {
  it('accepts a valid Bishopric meeting payload', () => {
    expect(isValidLeadershipMeetingPayload({
      meetingDate: '2026-09-08',
      meetingType: 'BISHOPRIC',
      agendaTemplate: 'BISHOPRIC'
    })).toBe(true);
  });

  it('rejects malformed dates and unsupported values', () => {
    expect(isValidLeadershipMeetingPayload({ meetingDate: '09/08/2026', meetingType: 'BISHOPRIC', agendaTemplate: 'BISHOPRIC' })).toBe(false);
    expect(isValidLeadershipMeetingPayload({ meetingDate: '2026-09-08', meetingType: 'INVALID', agendaTemplate: 'BISHOPRIC' })).toBe(false);
    expect(isValidLeadershipMeetingPayload({ meetingDate: '2026-09-08', meetingType: 'BISHOPRIC', agendaTemplate: 'INVALID' })).toBe(false);
  });
});
