import { MEETING_PROGRAM_PRESENTATIONS } from './constants';
import type { MeetingProgramPresentation } from './types';

export type MeetingProgramRow = { label: string; value: string };

export function meetingProgramPresentation(value: unknown): MeetingProgramPresentation {
  return MEETING_PROGRAM_PRESENTATIONS.includes(value as MeetingProgramPresentation)
    ? (value as MeetingProgramPresentation)
    : 'LABEL_VALUE';
}

export function meetingProgramPresentationClass(presentation: MeetingProgramPresentation): string {
  return `document-meeting-program--${presentation.toLowerCase().replaceAll('_', '-')}`;
}

export function formatMeetingProgramPdfRows(rows: readonly MeetingProgramRow[], presentation: MeetingProgramPresentation): string[] {
  return rows.map(({ label, value }) => {
    if (presentation === 'DOTTED_LEADERS') return `${label}  . . .  ${value.replaceAll('—', '-')}`;
    if (presentation === 'CENTERED_STACKED') return `${label}\n${value.replaceAll('—', '-')}`;
    return `${label}: ${value.replaceAll('—', '-')}`;
  });
}
