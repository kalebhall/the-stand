import { describe, expect, it, vi } from 'vitest';

import { isConferenceMeetingType, queueCallingBusinessLine } from './meeting-business';

describe('meeting business queueing', () => {
  it('recognizes conference meetings as ineligible for ward business', () => {
    expect(isConferenceMeetingType('STAKE_CONFERENCE')).toBe(true);
    expect(isConferenceMeetingType('GENERAL_CONFERENCE')).toBe(true);
    expect(isConferenceMeetingType('SACRAMENT')).toBe(false);
  });

  it('queues a sustain or release line on next eligible meeting', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ member_name: 'Doe, Jane', calling_name: 'Primary President' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'meeting-1' }] })
      .mockResolvedValueOnce({});

    const meetingId = await queueCallingBusinessLine({ query } as never, {
      wardId: 'ward-1',
      callingId: 'calling-1',
      actionType: 'SUSTAIN'
    });

    expect(meetingId).toBe('meeting-1');
    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining('calling_assignment'), ['calling-1', 'ward-1']);
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining("meeting_type NOT IN ('STAKE_CONFERENCE', 'GENERAL_CONFERENCE')"), [
      'ward-1'
    ]);
    expect(query).toHaveBeenNthCalledWith(3, expect.stringContaining('INSERT INTO meeting_business_line'), [
      'ward-1',
      'meeting-1',
      'calling-1',
      'Doe, Jane',
      'Primary President',
      'SUSTAIN'
    ]);
  });

  it('moves an existing conference Sunday to a new eligible meeting', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ member_name: 'Doe, Jane', calling_name: 'Primary President' }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ next_sunday: '2026-10-04' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'conference-meeting', meeting_type: 'STAKE_CONFERENCE' }] })
      .mockResolvedValueOnce({ rows: [{ meeting_date: '2026-10-11' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'replacement-meeting' }] })
      .mockResolvedValueOnce({});

    const meetingId = await queueCallingBusinessLine({ query } as never, {
      wardId: 'ward-1',
      callingId: 'calling-1',
      actionType: 'SUSTAIN'
    });

    expect(meetingId).toBe('replacement-meeting');
    expect(query).toHaveBeenNthCalledWith(3, expect.stringContaining('pg_advisory_xact_lock'), ['ward-1:business-fallback']);
    expect(query).toHaveBeenNthCalledWith(4, expect.stringContaining('next_sunday'));
    expect(query).toHaveBeenNthCalledWith(5, expect.stringContaining('SELECT id, meeting_type FROM meeting'), ['ward-1', '2026-10-04']);
    expect(query).toHaveBeenNthCalledWith(6, expect.stringContaining('generate_series'), ['2026-10-04', 'ward-1']);
    expect(query).toHaveBeenNthCalledWith(7, expect.stringContaining("INSERT INTO meeting (ward_id, meeting_date, meeting_type, status)"), [
      'ward-1',
      '2026-10-11'
    ]);
  });
});
