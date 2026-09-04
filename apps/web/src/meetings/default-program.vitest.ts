import { describe, expect, it } from 'vitest';

import { getDefaultProgramItemsForMeetingType } from './default-program';

describe('getDefaultProgramItemsForMeetingType', () => {
  it('returns the sacrament template in the expected order', () => {
    const itemTypes = getDefaultProgramItemsForMeetingType('SACRAMENT').map((item) => item.itemType);

    expect(itemTypes).toEqual([
      'INTRODUCTION',
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

  it('uses one protected introduction item before announcements', () => {
    const itemTypes = getDefaultProgramItemsForMeetingType('SACRAMENT').map((item) => item.itemType);
    expect(itemTypes[0]).toBe('INTRODUCTION');
    expect(getDefaultProgramItemsForMeetingType('SACRAMENT')[0].introductionRoles).toEqual({
      presiding: '',
      conducting: '',
      organist: '',
      chorister: ''
    });
  });

  it.each(['FAST_TESTIMONY', 'WARD_CONFERENCE'])('adds protected introduction item before announcements for %s meetings', (meetingType) => {
    const itemTypes = getDefaultProgramItemsForMeetingType(meetingType).map((item) => item.itemType);
    expect(itemTypes[0]).toBe('INTRODUCTION');
  });
});
