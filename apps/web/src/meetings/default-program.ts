import { isMeetingType, type MeetingType, type ProgramItemInput } from './types';

const EMPTY_ITEM_FIELDS = {
  title: '',
  notes: '',
  hymnNumber: '',
  hymnTitle: ''
} as const;

const MEETING_DEFAULT_ITEM_TYPES: Record<MeetingType, string[]> = {
  SACRAMENT: [
    'PRESIDING',
    'CONDUCTING',
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
  ],
  FAST_TESTIMONY: [
    'PRESIDING',
    'CONDUCTING',
    'ANNOUNCEMENT',
    'OPENING_HYMN',
    'INVOCATION',
    'WARD_AND_STAKE_BUSINESS',
    'SACRAMENT_HYMN',
    'SACRAMENT',
    'TESTIMONIES',
    'CLOSING_HYMN',
    'BENEDICTION'
  ],
  WARD_CONFERENCE: [
    'PRESIDING',
    'CONDUCTING',
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
  ],
  STAKE_CONFERENCE: ['ANNOUNCEMENT'],
  GENERAL_CONFERENCE: ['ANNOUNCEMENT']
};

export function getDefaultProgramItemsForMeetingType(meetingType: string): ProgramItemInput[] {
  const safeMeetingType: MeetingType = isMeetingType(meetingType) ? meetingType : 'SACRAMENT';
  return MEETING_DEFAULT_ITEM_TYPES[safeMeetingType].map((itemType) => ({ itemType, ...EMPTY_ITEM_FIELDS }));
}
