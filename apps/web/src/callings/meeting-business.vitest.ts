import { describe, expect, it, vi } from 'vitest';

import { isConferenceMeetingType, queueCallingBusinessLine } from './meeting-business';

describe('meeting business queueing', () => {
  it('recognizes conference meetings as ineligible for ward business', () => {
    expect(isConferenceMeetingType('STAKE_CONFERENCE')).toBe(true);
    expect(isConferenceMeetingType('GENERAL_CONFERENCE')).toBe(true);
    expect(isConferenceMeetingType('SACRAMENT')).toBe(false);
  });

  it('queues a sustain or release line on next eligible meeting', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ member_name: 'Doe, Jane', calling_name: 'Primary President' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'meeting-1' }] })
      .mockResolvedValueOnce({});

    const meetingId = await queueCallingBusinessLine({ query } as never, {
      wardId: 'ward-1', callingId: 'calling-1', actionType: 'SUSTAIN'
    });

    expect(meetingId).toBe('meeting-1');
    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining('calling_assignment'), ['calling-1', 'ward-1']);
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining("meeting_type NOT IN ('STAKE_CONFERENCE', 'GENERAL_CONFERENCE')"), ['ward-1']);
    expect(query).toHaveBeenNthCalledWith(3, expect.stringContaining('INSERT INTO meeting_business_line'), ['ward-1', 'meeting-1', 'Doe, Jane', 'Primary President', 'SUSTAIN']);
  });
});
