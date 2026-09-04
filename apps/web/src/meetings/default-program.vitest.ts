import { describe, expect, it } from 'vitest';

import { getDefaultProgramItemsForMeetingType } from './default-program';
import { getProgramItemLabel } from './types';

describe('getDefaultProgramItemsForMeetingType', () => {
  it('returns the sacrament template in the expected order', () => {
    const itemTypes = getDefaultProgramItemsForMeetingType('SACRAMENT').map((item) => item.itemType);

    expect(itemTypes).toEqual([
      'PRESIDING',
      'CONDUCTING',
      'ORGANIST_PIANIST',
      'CHORISTER',
      'ANNOUNCEMENT',
      'OPENING_HYMN',
      'INVOCATION',
      'WARD_AND_STAKE_BUSINESS',
      'SACRAMENT_HYMN',
      'SACRAMENT',
      'SPEAKER',
      'REST_HYMN',
      'SPEAKER',
      'CLOSING_HYMN',
      'BENEDICTION'
    ]);
  });

  it('returns the conference template with only announcements', () => {
    const stakeConferenceItems = getDefaultProgramItemsForMeetingType('STAKE_CONFERENCE').map((item) => item.itemType);
    const generalConferenceItems = getDefaultProgramItemsForMeetingType('GENERAL_CONFERENCE').map((item) => item.itemType);

    expect(stakeConferenceItems).toEqual(['ANNOUNCEMENT']);
    expect(generalConferenceItems).toEqual(['ANNOUNCEMENT']);
  });

  it('keeps introduction roles together before announcements', () => {
    const itemTypes = getDefaultProgramItemsForMeetingType('SACRAMENT').map((item) => item.itemType);
    expect(itemTypes.slice(0, 4)).toEqual(['PRESIDING', 'CONDUCTING', 'ORGANIST_PIANIST', 'CHORISTER']);
  });

  it.each(['FAST_TESTIMONY', 'WARD_CONFERENCE'])('adds musicians after conducting for %s meetings', (meetingType) => {
    const itemTypes = getDefaultProgramItemsForMeetingType(meetingType).map((item) => item.itemType);
    const conductingIndex = itemTypes.indexOf('CONDUCTING');

    expect(itemTypes.slice(conductingIndex, conductingIndex + 3)).toEqual(['CONDUCTING', 'ORGANIST_PIANIST', 'CHORISTER']);
  });

  it('uses a readable label for the combined musician entry', () => {
    expect(getProgramItemLabel('ORGANIST_PIANIST')).toBe('Organist / Pianist');
  });
});
