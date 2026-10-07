import { z } from 'zod';

import { INTRODUCTION_ITEM_TYPE, VISITING_LEADER_TYPES, type IntroductionRoles } from './types';

export const sourceRevisionSchema = z.string().regex(/^sr1_[a-f0-9]{64}$/);
export type SourceRevision = z.infer<typeof sourceRevisionSchema>;

const nullableText = (max: number) => z.string().max(max).nullable();

export const introductionRoleSchema = z.enum(['presiding', 'conducting', 'organist', 'chorister']);
export type IntroductionRole = z.infer<typeof introductionRoleSchema>;

export const introductionRolesSchema = z
  .object({
    presiding: z.string().max(200),
    conducting: z.string().max(200),
    organist: z.string().max(200),
    chorister: z.string().max(200),
    visitingLeaders: z
      .array(
        z
          .object({
            name: z.string().max(200),
            calling: z.string().max(200),
            recognitionType: z.enum(VISITING_LEADER_TYPES).optional()
          })
          .strict()
      )
      .max(20)
      .optional()
  })
  .strict();

export type EditorProgramItem = {
  id: string;
  sequence: number;
  itemType: string;
  title: string | null;
  notes: string | null;
  topic: string | null;
  programNotes: string | null;
  hymnNumber: string | null;
  hymnTitle: string | null;
  hymnLocale: string;
  introductionRoles: IntroductionRoles | null;
  speakerStatus: string | null;
  sourceState: 'EDITABLE' | 'MANAGED';
  managedHref: string | null;
  internalNotesEditable: boolean;
};

export const editorProgramItemSchema: z.ZodType<EditorProgramItem> = z
  .object({
    id: z.string().uuid(),
    sequence: z.number().int().positive(),
    itemType: z.string().min(1).max(100),
    title: nullableText(500),
    notes: nullableText(4000),
    topic: nullableText(1000),
    programNotes: nullableText(4000),
    hymnNumber: nullableText(50),
    hymnTitle: nullableText(500),
    hymnLocale: z.string().min(2).max(20),
    introductionRoles: introductionRolesSchema.nullable(),
    speakerStatus: z.string().max(40).nullable(),
    sourceState: z.enum(['EDITABLE', 'MANAGED']),
    managedHref: z.string().max(500).nullable(),
    internalNotesEditable: z.boolean()
  })
  .strict();

export const programItemsResponseSchema = z
  .object({
    meeting: z.object({ id: z.string().uuid(), meetingDate: z.string(), meetingType: z.string() }).strict(),
    sourceRevision: sourceRevisionSchema,
    items: z.array(editorProgramItemSchema)
  })
  .strict();
export type ProgramItemsResponse = z.infer<typeof programItemsResponseSchema>;

const textPatchSchema = z.discriminatedUnion('field', [
  z.object({ kind: z.literal('TEXT'), field: z.literal('title'), value: z.string().max(500).nullable() }).strict(),
  z.object({ kind: z.literal('TEXT'), field: z.literal('topic'), value: z.string().max(1000).nullable() }).strict(),
  z.object({ kind: z.literal('TEXT'), field: z.literal('notes'), value: z.string().max(4000).nullable() }).strict(),
  z.object({ kind: z.literal('TEXT'), field: z.literal('programNotes'), value: z.string().max(4000).nullable() }).strict()
]);

const introductionRolePatchSchema = z
  .object({
    kind: z.literal('INTRODUCTION_ROLE'),
    role: introductionRoleSchema,
    value: z.string().max(200).nullable()
  })
  .strict();

const introductionRolesPatchSchema = z
  .object({
    kind: z.literal('INTRODUCTION_ROLES'),
    value: introductionRolesSchema
  })
  .strict();

const hymnPatchSchema = z
  .object({
    kind: z.literal('HYMN'),
    number: z.string().max(50).nullable(),
    title: z.string().max(500).nullable(),
    locale: z.string().min(2).max(20)
  })
  .strict();

export const patchProgramItemRequestSchema = z
  .object({
    expectedRevision: sourceRevisionSchema,
    patch: z.union([textPatchSchema, introductionRolePatchSchema, introductionRolesPatchSchema, hymnPatchSchema])
  })
  .strict();
export type PatchProgramItemRequest = z.infer<typeof patchProgramItemRequestSchema>;

export const patchProgramItemResponseSchema = z
  .object({
    itemId: z.string().uuid(),
    sourceRevision: sourceRevisionSchema,
    items: z.array(editorProgramItemSchema)
  })
  .strict();

export type ProgramItemsErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'INVALID_ITEM_PATCH'
  | 'SOURCE_MANAGED'
  | 'INVALID_PROTECTED_ORDER'
  | 'REVISION_CONFLICT'
  | 'INTERNAL_ERROR';

export function defaultIntroductionRoles(value: unknown): IntroductionRoles {
  const parsed = introductionRolesSchema.partial().safeParse(value);
  if (parsed.success) {
    return {
      presiding: parsed.data.presiding ?? '',
      conducting: parsed.data.conducting ?? '',
      organist: parsed.data.organist ?? '',
      chorister: parsed.data.chorister ?? '',
      ...(parsed.data.visitingLeaders ? { visitingLeaders: parsed.data.visitingLeaders } : {})
    };
  }
  return { presiding: '', conducting: '', organist: '', chorister: '' };
}

export function isIntroductionItem(itemType: string): boolean {
  return itemType.toUpperCase() === INTRODUCTION_ITEM_TYPE;
}

export function isHymnItem(itemType: string): boolean {
  const normalized = itemType.toUpperCase();
  return normalized === 'HYMN' || normalized.endsWith('_HYMN');
}
