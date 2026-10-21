import { createHash } from 'node:crypto';

import {
  defaultIntroductionRoles,
  type EditorIntroductionRoles,
  type EditorProgramItem,
  type SourceRevision
} from './program-item-contracts';
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

export function projectEditorIntroductionRoles(value: unknown): EditorIntroductionRoles {
  const roles = defaultIntroductionRoles(value);
  return {
    presiding: roles.presiding,
    conducting: roles.conducting,
    organist: roles.organist,
    chorister: roles.chorister
  };
}

export function toEditorProgramItem(row: ProgramItemSourceRow): EditorProgramItem {
  const managed = sourceState(row.item_type) === 'MANAGED';
  return {
    id: row.id,
    sequence: row.sequence,
    itemType: row.item_type,
    title: row.title,
    topic: row.topic,
    programNotes: row.program_notes,
    hymnNumber: row.hymn_number,
    hymnTitle: row.hymn_title,
    hymnLocale: row.hymn_locale || 'en-US',
    introductionRoles: row.introduction_roles == null ? null : projectEditorIntroductionRoles(row.introduction_roles),
    speakerStatus: row.speaker_status,
    sourceState: managed ? 'MANAGED' : 'EDITABLE',
    managedHref: managed ? (row.item_type.toUpperCase() === 'ANNOUNCEMENT' ? '/announcements' : '/meetings') : null
  };
}

export function toEditorProgramItems(rows: ReadonlyArray<ProgramItemSourceRow>): EditorProgramItem[] {
  return rows
    .slice()
    .sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id))
    .map((row) => toEditorProgramItem(row));
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
    items: toEditorProgramItems(rows)
  };
}

export function updateIntroductionRole(
  value: unknown,
  role: keyof Pick<IntroductionRoles, 'presiding' | 'conducting' | 'organist' | 'chorister'>,
  nextValue: string | null
): IntroductionRoles {
  return { ...defaultIntroductionRoles(value), [role]: nextValue?.trim() ?? '' };
}
