import { z } from 'zod';

export const PROGRAM_SCHEMA_VERSION = 1 as const;

export const PROGRAM_TYPES = ['SACRAMENT_PROGRAM', 'BAPTISM_PROGRAM'] as const;
export type ProgramType = (typeof PROGRAM_TYPES)[number];

export const PROGRAM_SOURCE_TYPES = ['STAND_MEETING', 'BAPTISM_EVENT'] as const;
export type ProgramSourceType = (typeof PROGRAM_SOURCE_TYPES)[number];

export const programSourceRefSchema = z.object({
  sourceType: z.enum(PROGRAM_SOURCE_TYPES),
  sourceId: z.string().min(1),
  sourceVersion: z.string().min(1).nullable().optional()
}).strict();
export type ProgramSourceRef = z.infer<typeof programSourceRefSchema>;

export const programMetadataSchema = z.object({
  title: z.string().min(1).max(500),
  date: z.string().min(1).max(100),
  location: z.string().max(500).nullable().optional()
}).strict();
export type ProgramMetadata = z.infer<typeof programMetadataSchema>;

export const programDocumentSchema = z.object({
  id: z.string().min(1),
  programType: z.enum(PROGRAM_TYPES),
  source: programSourceRefSchema,
  schemaVersion: z.literal(PROGRAM_SCHEMA_VERSION),
  metadata: programMetadataSchema,
  payload: z.any()
}).strict();

export type ProgramDocument<TPayload = unknown> = {
  id: string;
  programType: ProgramType;
  source: ProgramSourceRef;
  schemaVersion: typeof PROGRAM_SCHEMA_VERSION;
  metadata: ProgramMetadata;
  payload: TPayload;
};

export function parseProgramDocument(input: unknown): ProgramDocument {
  return programDocumentSchema.parse(input) as ProgramDocument;
}
