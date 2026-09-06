import { describe, expect, it } from 'vitest';

import { buildMeetingRenderHtml, type MeetingRenderInput } from './render';

const baseFixture: MeetingRenderInput = {
  meetingDate: '2026-02-08',
  meetingType: 'SACRAMENT',
  programItems: [
    {
      itemType: 'SPEAKER',
      title: 'Jane Doe',
      notes: null,
      topic: 'Finding peace through prayer',
      programNotes: 'Please welcome our speaker.',
      hymnNumber: null,
      hymnTitle: null
    },
    {
      itemType: 'CLOSING_HYMN',
      title: null,
      notes: null,
      hymnNumber: '220',
      hymnTitle: 'Lord, I Would Follow Thee'
    }
  ],
  announcements: [
    {
      title: 'Ward activity',
      body: 'Join us after the meeting.',
      startDate: null,
      endDate: null,
      isPermanent: true,
      placement: 'PROGRAM_BOTTOM',
      includeInProgram: true
    }
  ],
  publicUrl: 'https://thestand.app/p/fixture-token'
};

describe('public print fixtures', () => {
  it.each([
    ['SINGLE_SHEET_BIFOLD', 'AFTER_PROGRAM'],
    ['TRI_FOLD_BULLETIN', 'BACK_PANEL'],
    ['FULL_PAGE', 'NONE']
  ] as const)('renders stable %s fixture with %s announcements', (preset, announcementMode) => {
    const input: MeetingRenderInput = {
      ...baseFixture,
      layout: { preset, announcementMode, coverMode: 'NONE' }
    };

    const first = buildMeetingRenderHtml(input);
    const second = buildMeetingRenderHtml(input);

    expect(second).toBe(first);
    expect(first).toContain(`data-layout-preset="${preset}"`);
    expect(first).toContain(`data-announcement-mode="${announcementMode}"`);
    expect(first).toContain('Jane Doe');
    expect(first).toContain('Finding peace through prayer');
    expect(first).toContain('Lord, I Would Follow Thee');
    expect(first).toContain('aria-label="QR code for digital program"');
  });

  it('keeps long and HTML-sensitive fixture content escaped and intact', () => {
    const input: MeetingRenderInput = {
      ...baseFixture,
      meetingDate: '2026-02-08 <draft>',
      programItems: [
        {
          itemType: 'SPEAKER',
          title: '<Speaker>',
          notes: null,
          topic: 'A topic with <unsafe> markup',
          programNotes: 'A long note '.repeat(80),
          hymnNumber: null,
          hymnTitle: null
        }
      ],
      layout: { preset: 'FULL_PAGE', announcementMode: 'AFTER_PROGRAM', coverMode: 'NONE' }
    };

    const html = buildMeetingRenderHtml(input);

    expect(html).toContain('2026-02-08 &lt;draft&gt;');
    expect(html).toContain('&lt;Speaker&gt;');
    expect(html).toContain('A topic with &lt;unsafe&gt; markup');
    expect(html).not.toContain('<Speaker>');
    expect(html).not.toContain('<unsafe>');
    expect(html).toContain('A long note');
  });
});
