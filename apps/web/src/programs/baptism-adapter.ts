import type { ProgramDocument } from './contracts';
import type { ProgramSourceAdapter } from './source-adapter';

/**
 * Source contract for a baptism program. The source deliberately contains only
 * event/program data: no member IDs, ordinance records, or private notes cross
 * into the generic Programs capability.
 */
export type BaptismProgramSource = {
  wardId: string;
  eventId: string;
  eventVersion?: string | null;
  date: string;
  title: string;
  location?: string | null;
  participantDisplayName: string;
  programItems: Array<{
    key: string;
    label: string;
    content?: string | null;
    sequence: number;
  }>;
};

export type BaptismProgramEditorData = BaptismProgramSource;
export type BaptismProgramRenderInput = {
  title: string;
  date: string;
  location: string | null;
  participantDisplayName: string;
  items: BaptismProgramSource['programItems'];
};

export const BAPTISM_PROGRAM_TEMPLATES = ['STANDARD_BAPTISM'] as const;
export type BaptismProgramTemplate = (typeof BAPTISM_PROGRAM_TEMPLATES)[number];

export const baptismProgramAdapter: ProgramSourceAdapter<
  BaptismProgramSource,
  BaptismProgramEditorData,
  BaptismProgramRenderInput
> = {
  programType: 'BAPTISM_PROGRAM',
  sourceType: 'BAPTISM_EVENT',
  resolveSourceRef(source) {
    return {
      sourceType: 'BAPTISM_EVENT',
      sourceId: source.eventId,
      sourceVersion: this.getSourceVersion(source)
    };
  },
  getSourceVersion(source) {
    return source.eventVersion ?? null;
  },
  toEditorData(source) {
    return source;
  },
  toRenderInput(source) {
    return {
      title: source.title,
      date: source.date,
      location: source.location ?? null,
      participantDisplayName: source.participantDisplayName,
      items: source.programItems
    };
  },
  toDocument(source, payload): ProgramDocument {
    return {
      id: `baptism-event-program:${source.eventId}`,
      programType: 'BAPTISM_PROGRAM',
      source: this.resolveSourceRef(source),
      schemaVersion: 1,
      metadata: {
        title: source.title,
        date: source.date,
        location: source.location ?? null
      },
      payload
    };
  }
};
