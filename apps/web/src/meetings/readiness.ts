import type { ProgramItemInput } from './types';

export type MeetingReadiness = {
  speakers: { total: number; ready: number; missingTopic: number; pending: number };
  hymns: { total: number; missing: number };
  prayers: { total: number; missing: number };
  requiredParticipants: { total: number; missing: number };
};

const HYMN_TYPES = new Set(['OPENING_HYMN', 'SACRAMENT_HYMN', 'REST_HYMN', 'CLOSING_HYMN', 'SPECIAL_HYMN']);
const PRAYER_TYPES = new Set(['INVOCATION', 'BENEDICTION']);
const PARTICIPANT_TYPES = new Set(['PRESIDING', 'CONDUCTING', 'ORGANIST_PIANIST', 'CHORISTER']);

export function getMeetingReadiness(items: ProgramItemInput[]): MeetingReadiness {
  const speakers = items.filter((item) => item.itemType.toUpperCase() === 'SPEAKER');
  const hymns = items.filter((item) => HYMN_TYPES.has(item.itemType.toUpperCase()));
  const prayers = items.filter((item) => PRAYER_TYPES.has(item.itemType.toUpperCase()));
  const participants = items.filter((item) => PARTICIPANT_TYPES.has(item.itemType.toUpperCase()));
  const missingTopic = speakers.filter((item) => !item.topic?.trim()).length;
  const missingHymns = hymns.filter((item) => !item.hymnNumber?.trim() || !item.hymnTitle?.trim()).length;
  const missingPrayers = prayers.filter((item) => !item.title?.trim()).length;
  const missingParticipants = participants.filter((item) => !item.title?.trim()).length;
  const pending = speakers.filter((item) => (item.speakerStatus ?? 'PLANNED') !== 'COMPLETED').length;

  return {
    speakers: { total: speakers.length, ready: speakers.length - missingTopic, missingTopic, pending },
    hymns: { total: hymns.length, missing: missingHymns },
    prayers: { total: prayers.length, missing: missingPrayers },
    requiredParticipants: { total: participants.length, missing: missingParticipants }
  };
}
