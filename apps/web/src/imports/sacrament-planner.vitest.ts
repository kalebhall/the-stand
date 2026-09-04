// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { normalizeHistoricalName, parseSacramentPlannerHtml } from './sacrament-planner';

describe('parseSacramentPlannerHtml', () => {
  it('maps dates, meeting types, hymns, speakers, and themes while excluding future dates', () => {
    const html = `<table>
      <tr><td></td><td>Nov- 17 (2024)</td><td>Sep- 6 (2026)</td></tr>
      <tr><td>MEETING TYPE</td><td>REGULAR</td><td>REGULAR</td></tr>
      <tr><td>OPENING HYMN</td><td>2 The Spirit of God</td><td>3 Now Let us Rejoice</td></tr>
      <tr><td>YOUTH SPEAKER</td><td>Jane Doe</td><td>Future Person</td></tr>
      <tr><td>THEME 1</td><td>Faith in Christ</td><td>Future topic</td></tr>
      <tr><td>INVOCATION</td><td>John Doe</td><td>Future Prayer</td></tr>
    </table>`;

    expect(parseSacramentPlannerHtml(html, '2026-08-30')).toEqual([
      {
        meetingDate: '2024-11-17',
        meetingType: 'SACRAMENT',
        programItems: [
          { itemType: 'OPENING_HYMN', title: '', hymnNumber: '2', hymnTitle: 'The Spirit of God' },
          { itemType: 'INVOCATION', title: 'John Doe' },
          { itemType: 'SPEAKER', title: 'Jane Doe', topic: 'Faith in Christ' }
        ]
      }
    ]);
  });

  it('does not shift later meeting values into an earlier blank column', () => {
    const html = `<table>
      <tr><td></td><td>Nov- 17 (2024)</td><td>Nov- 24 (2024)</td></tr>
      <tr><td>MEETING TYPE</td><td>REGULAR</td><td>REGULAR</td></tr>
      <tr><td>OPENING HYMN</td><td></td><td>2 The Spirit of God</td></tr>
      <tr><td>INVOCATION</td><td></td><td>John Doe</td></tr>
    </table>`;

    expect(parseSacramentPlannerHtml(html, '2026-08-30')).toEqual([
      { meetingDate: '2024-11-24', meetingType: 'SACRAMENT', programItems: [{ itemType: 'OPENING_HYMN', title: '', hymnNumber: '2', hymnTitle: 'The Spirit of God' }, { itemType: 'INVOCATION', title: 'John Doe' }] }
    ]);
  });

  it('normalizes common church title prefixes for confident matching', () => {
    expect(normalizeHistoricalName('Sister Jane Doe')).toBe('jane doe');
    expect(normalizeHistoricalName('Brother Hall.')).toBe('hall');
  });
});
