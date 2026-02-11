import { describe, expect, it } from 'vitest';

import { buildMeetingRenderHtml } from './render';

describe('buildMeetingRenderHtml', () => {
  it('renders meeting details and program items', () => {
    const html = buildMeetingRenderHtml({
      meetingDate: '2026-01-04',
      meetingType: 'SACRAMENT',
      programItems: [{ itemType: 'OPENING_HYMN', title: null, notes: null, hymnNumber: '2', hymnTitle: 'The Spirit of God' }]
    });

    expect(html).toContain('Sacrament Meeting Program');
    expect(html).toContain('2026-01-04');
    expect(html).toContain('OPENING HYMN');
    expect(html).toContain('#2 — The Spirit of God');
  });

  it('renders active and permanent announcements by placement', () => {
    const html = buildMeetingRenderHtml({
      meetingDate: '2026-01-04',
      meetingType: 'SACRAMENT',
      programItems: [{ itemType: 'OPENING_HYMN', title: null, notes: null, hymnNumber: '2', hymnTitle: 'The Spirit of God' }],
      announcements: [
        {
          title: 'Top notice',
          body: 'Top body',
          startDate: '2026-01-01',
          endDate: '2026-01-10',
          isPermanent: false,
          placement: 'PROGRAM_TOP'
        },
        {
          title: 'Permanent bottom',
          body: 'Bottom body',
          startDate: '2026-04-01',
          endDate: '2026-04-10',
          isPermanent: true,
          placement: 'PROGRAM_BOTTOM'
        },
        {
          title: 'Hidden',
          body: null,
          startDate: '2026-02-01',
          endDate: null,
          isPermanent: false,
          placement: 'PROGRAM_TOP'
        }
      ]
    });

    expect(html).toContain('Top notice');
    expect(html).toContain('Permanent bottom');
    expect(html).not.toContain('Hidden');
  });

  it('escapes html from user content', () => {
    const html = buildMeetingRenderHtml({
      meetingDate: '<script>alert(1)</script>',
      meetingType: 'SACRAMENT',
      programItems: [{ itemType: 'SPEAKER', title: '<b>Elder</b>', notes: 'Use <unsafe>', hymnNumber: null, hymnTitle: null }]
    });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;Elder&lt;/b&gt;');
    expect(html).toContain('Use &lt;unsafe&gt;');
  });
});
