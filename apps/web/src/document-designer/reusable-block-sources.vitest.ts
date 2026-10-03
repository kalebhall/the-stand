import { describe, expect, it } from 'vitest';

import { resolveReusableBlockSource, assertReusableBlockSourceReference } from './reusable-block-sources';

const source = { meetingDate: '2026-10-04', meetingType: 'SACRAMENT', meetingTime: '10:00', wardName: 'Freedom Park Ward', location: 'Meetinghouse', publicUrl: 'https://example.test/p/program', programItems: [] };

describe('reusable block source references', () => {
  it('resolves only approved safe meeting values', () => {
    expect(resolveReusableBlockSource({ key: 'WARD_NAME' }, source)).toBe('Freedom Park Ward');
    expect(resolveReusableBlockSource({ key: 'MEETING_TYPE' }, source)).toBe('SACRAMENT');
    expect(resolveReusableBlockSource({ key: 'MEETING_LOCATION' }, source)).toBe('Meetinghouse');
  });

  it('uses fallback text for absent values', () => {
    expect(resolveReusableBlockSource({ key: 'MEETING_TIME', fallbackText: 'Time TBD' }, { ...source, meetingTime: null })).toBe('Time TBD');
  });

  it('rejects unsupported or oversized source references', () => {
    expect(() => assertReusableBlockSourceReference({ key: 'MEMBER_NAME' } as never)).toThrow('Unsupported');
    expect(() => assertReusableBlockSourceReference({ key: 'WARD_NAME', fallbackText: 'x'.repeat(501) })).toThrow('fallback');
  });
});
