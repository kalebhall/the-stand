export const TECHNOLOGY_CHECKLIST_FIELDS = ['roomReady', 'audioReady', 'streamReady', 'accessibilityChecked'] as const;
export type TechnologyChecklistField = (typeof TECHNOLOGY_CHECKLIST_FIELDS)[number];

export function isTechnologyReady(checklist: Record<TechnologyChecklistField, boolean>): boolean {
  return TECHNOLOGY_CHECKLIST_FIELDS.every((field) => checklist[field]);
}

export function canConfirmRecordingStop(recordingDeletionReminder: boolean): boolean {
  return recordingDeletionReminder;
}
