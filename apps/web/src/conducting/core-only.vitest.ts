import { describe, expect, it } from 'vitest';

import {
  buildConductView,
  buildPrepView,
  renderBasicProgram
} from './core';
import {
  canonicalizeMeeting,
  createMeetingContext,
  transitionMeetingStatus,
  type Meeting
} from './model';

describe('conducting Core-only flow', () => {
  it('boots with optional areas absent and completes prep → conduct → publish', () => {
    const draft: Meeting = canonicalizeMeeting({
      id: 'meeting-1',
      wardId: 'ward-1',
      meetingDate: '2026-10-04',
      meetingType: 'SACRAMENT',
      status: 'DRAFT',
      programItems: [
        {
          itemType: 'INTRODUCTION',
          title: 'Introduction',
          notes: '',
          topic: '',
          programNotes: '',
          hymnNumber: '',
          hymnTitle: '',
          introductionRoles: { presiding: 'Bishop', conducting: 'Counselor', organist: 'Sister Organist', chorister: 'Brother Chorister' },
          speakerStatus: null
        },
        {
          itemType: 'SPEAKER',
          title: 'Sister Hall',
          notes: '',
          topic: 'Faith in Jesus Christ',
          programNotes: '',
          hymnNumber: '',
          hymnTitle: '',
          introductionRoles: null,
          speakerStatus: 'CONFIRMED'
        },
        {
          itemType: 'SACRAMENT',
          title: '',
          notes: '',
          topic: '',
          programNotes: '',
          hymnNumber: '',
          hymnTitle: '',
          introductionRoles: null,
          speakerStatus: null
        }
      ]
    });
    const context = createMeetingContext('user-1', 'ward-1', draft);

    const prep = buildPrepView(context);
    expect(prep.readyToPublish).toBe(true);
    expect(prep.items).toHaveLength(3);

    const conducting = buildConductView(context);
    expect(conducting.rows.map((row) => row.kind)).toEqual(['welcome', 'item', 'item', 'sacrament']);

    const published: Meeting = { ...draft, status: transitionMeetingStatus(draft.status, 'publish') };
    expect(published.status).toBe('PUBLISHED');
    expect(renderBasicProgram(published)).toContain('Faith in Jesus Christ');

    const completed: Meeting = { ...published, status: transitionMeetingStatus(published.status, 'complete') };
    expect(completed.status).toBe('COMPLETED');
    expect(transitionMeetingStatus(completed.status, 'reopen')).toBe('PUBLISHED');
    expect(() => transitionMeetingStatus(completed.status, 'publish')).toThrow('Cannot publish a completed meeting.');
  });

  it('rejects a context whose ward does not own the meeting', () => {
    const meeting = canonicalizeMeeting({
      id: 'meeting-1', wardId: 'ward-a', meetingDate: '2026-10-04', meetingType: 'SACRAMENT', status: 'DRAFT', programItems: []
    });
    expect(() => createMeetingContext('user-1', 'ward-b', meeting)).toThrow('authenticated ward');
  });

  it('escapes authored content in the basic core renderer', () => {
    const meeting = canonicalizeMeeting({
      id: 'meeting-1', wardId: 'ward-1', meetingDate: '<date>', meetingType: 'SACRAMENT', status: 'PUBLISHED',
      programItems: [{ itemType: 'SPEAKER', title: '<person>', notes: '', topic: '<topic>', programNotes: '', hymnNumber: '', hymnTitle: '', introductionRoles: null, speakerStatus: null }]
    });
    expect(renderBasicProgram(meeting)).not.toContain('<person>');
    expect(renderBasicProgram(meeting)).toContain('&lt;person&gt;');
  });
});
