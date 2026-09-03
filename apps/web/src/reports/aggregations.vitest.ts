import { describe, expect, it, vi } from 'vitest';

import { loadReportData } from './aggregations';

describe('loadReportData', () => {
  it('maps speaker, topic, hymn, prayer, and completeness rows with ward/date filters', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ speaker_name: 'Jane Doe', count: 2, last_talk_date: '2026-08-30' }] })
      .mockResolvedValueOnce({ rows: [{ topic: 'Faith in Christ', speaker_name: 'Jane Doe', meeting_date: '2026-08-30' }] })
      .mockResolvedValueOnce({ rows: [{ hymn_number: '2', hymn_title: 'The Spirit of God', position: 'OPENING_HYMN', count: 3, last_used_date: '2026-08-23' }] })
      .mockResolvedValueOnce({ rows: [{ person_name: 'John Doe', prayer_type: 'INVOCATION', count: 2, last_assignment_date: '2026-08-16' }] })
      .mockResolvedValueOnce({ rows: [{ meeting_date: '2026-08-09', item_type: 'SPEAKER', title: 'Unassigned speaker', issue: 'Speaker topic missing' }] });

    const client = { query, release: vi.fn() };
    const data = await loadReportData(client, { wardId: 'ward-1', from: '2026-08-01', to: '2026-08-31' });

    expect(data).toEqual({
      speakers: [{ speakerName: 'Jane Doe', talkCount: 2, lastTalkDate: '2026-08-30' }],
      topics: [{ topic: 'Faith in Christ', speakerName: 'Jane Doe', meetingDate: '2026-08-30' }],
      hymns: [{ hymnNumber: '2', hymnTitle: 'The Spirit of God', position: 'OPENING_HYMN', useCount: 3, lastUsedDate: '2026-08-23' }],
      prayers: [{ personName: 'John Doe', prayerType: 'INVOCATION', assignmentCount: 2, lastAssignmentDate: '2026-08-16' }],
      completeness: [{ meetingDate: '2026-08-09', itemType: 'SPEAKER', title: 'Unassigned speaker', issue: 'Speaker topic missing' }]
    });
    expect(query).toHaveBeenCalledTimes(5);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('$1::uuid'), ['ward-1', '2026-08-01', '2026-08-31']);
  });
});
