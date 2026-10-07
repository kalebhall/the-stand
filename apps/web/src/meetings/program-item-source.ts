import { createHash } from 'node:crypto';

import { defaultIntroductionRoles, type EditorProgramItem, type SourceRevision } from './program-item-contracts';
import type { IntroductionRoles } from './types';

export type ProgramItemSourceRow = {
  id: string;
  sequence: number;
  item_type: string;
  title: string | null;
  notes: string | null;
  topic: string | null;
  program_notes: string | null;
  hymn_number: string | null;
  hymn_title: string | null;
  hymn_locale: string;
  introduction_roles: unknown;
  speaker_status: string | null;
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonicalize(entry)])
    );
  }
  return value;
}

export function canonicalizeProgramItems(rows: ReadonlyArray<ProgramItemSourceRow>, options: EditorProjectionOptions = {}): string {
  const includeInternalNotes = options.includeInternalNotes !== false;
  return JSON.stringify(
    rows
      .slice()
      .sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id))
      .map((row) =>
        canonicalize({
          id: row.id,
          sequence: row.sequence,
          itemType: row.item_type,
          title: row.title,
          ...(includeInternalNotes ? { notes: row.notes } : {}),
          topic: row.topic,
          programNotes: row.program_notes,
          hymnNumber: row.hymn_number,
          hymnTitle: row.hymn_title,
          hymnLocale: row.hymn_locale,
          introductionRoles: projectIntroductionRoles(row.introduction_roles, options),
          speakerStatus: row.speaker_status
        })
      )
  );
}

export function computeProgramItemsRevision(
  rows: ReadonlyArray<ProgramItemSourceRow>,
  options: EditorProjectionOptions = {}
): SourceRevision {
  return `sr1_${createHash('sha256').update(canonicalizeProgramItems(rows, options)).digest('hex')}` as SourceRevision;
}

export function isSourceManaged(itemType: string): boolean {
  return ['ANNOUNCEMENT', 'SUSTAINING', 'RELEASE'].includes(itemType.toUpperCase());
}

function sourceState(itemType: string): EditorProgramItem['sourceState'] {
  return isSourceManaged(itemType) ? 'MANAGED' : 'EDITABLE';
}

export type EditorProjectionOptions = { includeInternalNotes?: boolean };

export function projectIntroductionRoles(value: unknown, options: EditorProjectionOptions = {}): IntroductionRoles {
  const roles = defaultIntroductionRoles(value);
  if (options.includeInternalNotes === false) {
    const { visitingLeaders: _visitingLeaders, ...publicRoles } = roles;
    return publicRoles;
  }
  return roles;
}

export function toEditorProgramItem(row: ProgramItemSourceRow, options: EditorProjectionOptions = {}): EditorProgramItem {
  const managed = sourceState(row.item_type) === 'MANAGED';
  const includeInternalNotes = options.includeInternalNotes !== false;
  return {
    id: row.id,
    sequence: row.sequence,
    itemType: row.item_type,
    title: row.title,
    notes: includeInternalNotes ? row.notes : null,
    topic: row.topic,
    programNotes: row.program_notes,
    hymnNumber: row.hymn_number,
    hymnTitle: row.hymn_title,
    hymnLocale: row.hymn_locale || 'en-US',
    introductionRoles: row.introduction_roles == null ? null : projectIntroductionRoles(row.introduction_roles, options),
    speakerStatus: row.speaker_status,
    sourceState: managed ? 'MANAGED' : 'EDITABLE',
    managedHref: managed ? (row.item_type.toUpperCase() === 'ANNOUNCEMENT' ? '/announcements' : '/meetings') : null,
    internalNotesEditable: includeInternalNotes
  };
}

export function toEditorProgramItems(
  rows: ReadonlyArray<ProgramItemSourceRow>,
  options: EditorProjectionOptions = {}
): EditorProgramItem[] {
  return rows
    .slice()
    .sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id))
    .map((row) => toEditorProgramItem(row, options));
}

export type MeetingSource = { id: string; meetingDate: string; meetingType: string };

export function toProgramItemsResponse(
  meeting: MeetingSource,
  rows: ReadonlyArray<ProgramItemSourceRow>,
  options: EditorProjectionOptions = {}
) {
  return {
    meeting,
    sourceRevision: computeProgramItemsRevision(rows, options),
    items: toEditorProgramItems(rows, options)
  };
}

export function updateIntroductionRole(
  value: unknown,
  role: keyof Pick<IntroductionRoles, 'presiding' | 'conducting' | 'organist' | 'chorister'>,
  nextValue: string | null
): IntroductionRoles {
  return { ...defaultIntroductionRoles(value), [role]: nextValue?.trim() ?? '' };
}
