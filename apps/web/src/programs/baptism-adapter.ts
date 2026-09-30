import type { ProgramDocument } from './contracts';
import type { ProgramSourceAdapter } from './source-adapter';
import { z } from 'zod';

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

export const baptismProgramSourceSchema = z.object({
  wardId: z.string().min(1),
  eventId: z.string().min(1),
  eventVersion: z.string().min(1).nullable().optional(),
  date: z.string().min(1).max(100),
  title: z.string().min(1).max(500),
  location: z.string().max(500).nullable().optional(),
  participantDisplayName: z.string().min(1).max(500),
  programItems: z.array(z.object({
    key: z.string().min(1).max(100),
    label: z.string().min(1).max(500),
    content: z.string().max(2000).nullable().optional(),
    sequence: z.number().int().nonnegative()
  }).strict()).max(100)
}).strict();

export const baptismProgramPayloadSchema = z.object({
  template: z.enum(BAPTISM_PROGRAM_TEMPLATES)
}).strict();

function parseSource(source: BaptismProgramSource): BaptismProgramSource {
  return baptismProgramSourceSchema.parse(source);
}

export const baptismProgramAdapter: ProgramSourceAdapter<
  BaptismProgramSource,
  BaptismProgramEditorData,
  BaptismProgramRenderInput,
  'BAPTISM_PROGRAM',
  'BAPTISM_EVENT'
> = {
  programType: 'BAPTISM_PROGRAM',
  sourceType: 'BAPTISM_EVENT',
  resolveSourceRef(source) {
    const parsed = parseSource(source);
    return {
      sourceType: 'BAPTISM_EVENT',
      sourceId: parsed.eventId,
      sourceVersion: parsed.eventVersion ?? null
    };
  },
  getSourceVersion(source) {
    return parseSource(source).eventVersion ?? null;
  },
  toEditorData(source) {
    return parseSource(source);
  },
  toRenderInput(source) {
    const parsed = parseSource(source);
    return {
      title: parsed.title,
      date: parsed.date,
      location: parsed.location ?? null,
      participantDisplayName: parsed.participantDisplayName,
      items: parsed.programItems
    };
  },
  toDocument(source, payload): ProgramDocument {
    const parsed = parseSource(source);
    const parsedPayload = baptismProgramPayloadSchema.parse(payload);
    return {
      id: `baptism-event-program:${parsed.eventId}`,
      programType: 'BAPTISM_PROGRAM',
      source: { sourceType: 'BAPTISM_EVENT', sourceId: parsed.eventId, sourceVersion: parsed.eventVersion ?? null },
      schemaVersion: 1,
      metadata: {
        title: parsed.title,
        date: parsed.date,
        location: parsed.location ?? null
      },
      payload: parsedPayload
    };
  }
};
