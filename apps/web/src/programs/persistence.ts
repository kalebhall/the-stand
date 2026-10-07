import type { DocumentLayout, DocumentBlock } from '@/src/document-designer/types';
import { parseAdvancedLayout, type AdvancedDocumentLayout } from '@/src/document-designer/advanced-schema';
import { saveMeetingDocument, type Queryable } from '@/src/document-designer/persistence';
import { parseDocumentLayout } from '@/src/document-designer/schema';

import type { ProgramDocument, ProgramSourceRef } from './contracts';
import { requireProgramRegistration } from './service';

export type SacramentProgramPersistencePayload = {
  layout: DocumentLayout | AdvancedDocumentLayout;
  theme: Record<string, unknown>;
  sourceTemplateId?: string | null;
  sourceTemplateVersion?: number | null;
};

export type PersistedProgramDocument = ProgramDocument<SacramentProgramPersistencePayload> & {
  revision: number;
  updatedByUserId: string | null;
  updatedAt: Date | string | null;
};

export class InvalidProgramPersistenceInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidProgramPersistenceInputError';
  }
}

export type LegacyProgramDocumentRow = Record<string, unknown>;

const PRESIDING_CONDUCTING_BLOCK_ID = '00000000-0000-4000-8000-000000000014';

function presidingConductingBlock(): DocumentBlock {
  return {
    id: PRESIDING_CONDUCTING_BLOCK_ID,
    type: 'PRESIDING_CONDUCTING',
    width: 'FULL',
    dataMode: 'AUTO',
    visibility: 'VISIBLE',
    printBehavior: 'PRINT_AND_DIGITAL',
    digitalBehavior: 'NORMAL',
    config: { text: '' }
  } as DocumentBlock;
}

function hasLayoutLock(input: unknown): boolean {
  if (!input || typeof input !== 'object') return false;
  if (Array.isArray(input)) return input.some(hasLayoutLock);
  const value = input as Record<string, unknown>;
  const lock = value.lock;
  if (
    lock &&
    typeof lock === 'object' &&
    'level' in lock &&
    (lock as { level?: unknown }).level !== 'NONE' &&
    Array.isArray((lock as { properties?: unknown }).properties) &&
    (lock as unknown as { properties: unknown[] }).properties.length > 0
  ) {
    return true;
  }
  return Object.values(value).some(hasLayoutLock);
}

function getDocumentTitle(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;
  const pages = (input as { pages?: unknown }).pages;
  if (!Array.isArray(pages)) return null;
  for (const page of pages) {
    const regions = page && typeof page === 'object' ? (page as { regions?: unknown }).regions : null;
    if (!Array.isArray(regions)) continue;
    for (const region of regions) {
      const blocks = region && typeof region === 'object' ? (region as { blocks?: unknown }).blocks : null;
      if (!Array.isArray(blocks)) continue;
      const title = blocks.find((block) => block && typeof block === 'object' && (block as { type?: unknown }).type === 'DOCUMENT_TITLE');
      const text = title && typeof title === 'object' ? (title as { config?: { text?: unknown } }).config?.text : null;
      return typeof text === 'string' ? text : null;
    }
  }
  return null;
}

/** Mark known legacy layouts so localization does not depend on title text alone. */
export function ensureLegacyTitleProvenance<T>(input: T): T {
  if (!input || typeof input !== 'object') return input;
  const value = input as T & { metadata?: Record<string, unknown> };
  const metadata = value.metadata;
  if (
    !metadata ||
    metadata.documentTitleSource !== undefined ||
    metadata.legacyPreset === undefined ||
    getDocumentTitle(input) !== 'Sacrament Meeting'
  )
    return input;
  const next = structuredClone(input) as T & { metadata?: Record<string, unknown> };
  next.metadata = { ...metadata, documentTitleSource: 'LEGACY_DEFAULT' };
  return next;
}

export function clearLegacyTitleProvenance<T>(nextInput: T, currentInput: unknown, authoredTemplate: boolean): T {
  if (!nextInput || typeof nextInput !== 'object') return nextInput;
  const next = nextInput as T & { metadata?: Record<string, unknown> };
  const metadata = next.metadata;
  if (
    !metadata ||
    (metadata.documentTitleSource !== 'LEGACY_DEFAULT' && metadata.legacyPreset === undefined) ||
    (!authoredTemplate && getDocumentTitle(nextInput) === getDocumentTitle(currentInput))
  )
    return nextInput;
  const cloned = structuredClone(nextInput) as T & { metadata?: Record<string, unknown> };
  cloned.metadata = { ...metadata, documentTitleSource: 'AUTHORED' };
  return cloned;
}

/** Backfill old persisted documents so leadership rows are part of the editable layout. */
export function ensurePresidingConductingBlock(input: unknown): DocumentLayout | AdvancedDocumentLayout {
  const schemaVersion =
    input && typeof input === 'object' && 'schemaVersion' in input ? (input as { schemaVersion?: unknown }).schemaVersion : 1;
  if (schemaVersion === 2) {
    const layout = parseAdvancedLayout(input);
    if (layout.pages.some((page) => page.regions.some((region) => region.blocks.some((block) => block.type === 'PRESIDING_CONDUCTING'))))
      return layout;
    if (hasLayoutLock(layout)) return layout;
    const next = structuredClone(layout);
    const region = next.pages[0]?.regions[0];
    if (region) {
      const block = presidingConductingBlock();
      const meetingProgramIndex = Math.max(
        region.blocks.findIndex((candidate) => candidate.type === 'MEETING_PROGRAM'),
        0
      );
      region.blocks.splice(meetingProgramIndex, 0, block);
      const targetColumn = region.columns.blockIds.findIndex((column) => column.includes(region.blocks[meetingProgramIndex + 1]?.id ?? ''));
      const column = targetColumn >= 0 ? region.columns.blockIds[targetColumn] : region.columns.blockIds[0];
      if (column) {
        const meetingProgramId = region.blocks[meetingProgramIndex + 1]?.id;
        const columnIndex = meetingProgramId ? column.indexOf(meetingProgramId) : -1;
        column.splice(Math.max(columnIndex, 0), 0, block.id);
      }
    }
    return parseAdvancedLayout(next);
  }
  const layout = parseDocumentLayout(input);
  if (layout.pages.some((page) => page.regions.some((region) => region.blocks.some((block) => block.type === 'PRESIDING_CONDUCTING'))))
    return layout;
  if (hasLayoutLock(layout)) return layout;
  const next = structuredClone(layout);
  const region = next.pages[0]?.regions[0];
  if (region)
    region.blocks.splice(
      Math.max(
        region.blocks.findIndex((block) => block.type === 'MEETING_PROGRAM'),
        0
      ),
      0,
      presidingConductingBlock()
    );
  return parseDocumentLayout(next);
}

export async function loadProgramDocumentRecord(
  client: Queryable,
  input: { wardId: string; meetingId: string }
): Promise<LegacyProgramDocumentRow | null> {
  const result = await client.query(
    `SELECT md.id, md.source_template_id, md.source_template_version, md.schema_version, md.layout_json, md.theme_json, md.revision,
            t.name AS source_template_name
       FROM meeting_document md
       LEFT JOIN document_template t ON t.id = md.source_template_id
      WHERE md.meeting_id = $1::uuid AND md.ward_id = $2::uuid AND md.document_type = 'SACRAMENT_PROGRAM'
      LIMIT 1`,
    [input.meetingId, input.wardId]
  );
  return (result.rows[0] as LegacyProgramDocumentRow | undefined) ?? null;
}

export async function ensureProgramDocument(
  client: Queryable,
  input: { wardId: string; meetingId: string; userId: string; defaultLayout: DocumentLayout }
): Promise<LegacyProgramDocumentRow> {
  const existing = await client.query(
    `SELECT id, source_template_id, source_template_version, schema_version, layout_json, theme_json, revision
       FROM meeting_document
      WHERE meeting_id = $1::uuid AND ward_id = $2::uuid AND document_type = 'SACRAMENT_PROGRAM'
      LIMIT 1 FOR UPDATE`,
    [input.meetingId, input.wardId]
  );
  if (existing.rows[0]) {
    const row = existing.rows[0] as LegacyProgramDocumentRow;
    const layout = ensureLegacyTitleProvenance(ensurePresidingConductingBlock(row.layout_json));
    if (JSON.stringify(layout) !== JSON.stringify(row.layout_json)) {
      const updated = await client.query(
        `UPDATE meeting_document
            SET layout_json = $2::jsonb, schema_version = $3::int, revision = revision + 1, updated_by_user_id = $4::uuid, updated_at = now()
          WHERE id = $1::uuid
          RETURNING id, source_template_id, source_template_version, schema_version, layout_json, theme_json, revision`,
        [row.id, JSON.stringify(layout), layout.schemaVersion, input.userId]
      );
      return updated.rows[0] as LegacyProgramDocumentRow;
    }
    return row;
  }
  const inserted = await client.query(
    `INSERT INTO meeting_document (ward_id, meeting_id, document_type, source_template_id, source_template_version, schema_version, layout_json, theme_json, revision, updated_by_user_id)
     VALUES ($1::uuid, $2::uuid, 'SACRAMENT_PROGRAM', NULL, NULL, $3::int, $4::jsonb, $5::jsonb, 1, $6::uuid)
     RETURNING id, source_template_id, source_template_version, schema_version, layout_json, theme_json, revision`,
    [
      input.wardId,
      input.meetingId,
      input.defaultLayout.schemaVersion,
      JSON.stringify(input.defaultLayout),
      JSON.stringify(input.defaultLayout.theme),
      input.userId
    ]
  );
  return inserted.rows[0] as LegacyProgramDocumentRow;
}

export async function updateProgramDocument(
  client: Queryable,
  input: {
    id: string;
    wardId: string;
    schemaVersion: number;
    sourceTemplateId: string | null;
    sourceTemplateVersion: number | null;
    layout: unknown;
    theme: unknown;
    updatedByUserId: string;
    expectedRevision: number;
  }
): Promise<{ id: string; revision: number } | null> {
  const result = await client.query(
    `UPDATE meeting_document
        SET schema_version = $3::int, source_template_id = $4::uuid, source_template_version = $5::int, layout_json = $6::jsonb, theme_json = $7::jsonb, revision = revision + 1, updated_by_user_id = $8::uuid, updated_at = now()
      WHERE id = $1::uuid AND ward_id = $2::uuid AND revision = $9::int
      RETURNING id, revision`,
    [
      input.id,
      input.wardId,
      input.schemaVersion,
      input.sourceTemplateId,
      input.sourceTemplateVersion,
      JSON.stringify(input.layout),
      JSON.stringify(input.theme),
      input.updatedByUserId,
      input.expectedRevision
    ]
  );
  const row = result.rows[0] as { id: string; revision: number } | undefined;
  return row ? { id: row.id, revision: Number(row.revision) } : null;
}

function requireStandMeetingSource(source: ProgramSourceRef): string {
  if (source.sourceType !== 'STAND_MEETING' || !source.sourceId.trim()) {
    throw new InvalidProgramPersistenceInputError('SACRAMENT_PROGRAM requires a STAND_MEETING source.');
  }
  return source.sourceId;
}

function documentId(meetingId: string): string {
  return `stand-meeting-program:${meetingId}`;
}

export async function saveProgramDocument(
  client: Queryable,
  input: {
    wardId: string;
    document: ProgramDocument<SacramentProgramPersistencePayload>;
    updatedByUserId: string;
    expectedRevision?: number;
  }
): Promise<PersistedProgramDocument | null> {
  const registration = requireProgramRegistration(input.document.programType);
  if (registration.programType !== 'SACRAMENT_PROGRAM' || registration.sourceType !== 'STAND_MEETING') {
    throw new InvalidProgramPersistenceInputError('The legacy meeting-document facade only persists SACRAMENT_PROGRAM documents.');
  }
  const meetingId = requireStandMeetingSource(input.document.source);
  const row = await saveMeetingDocument(client, {
    wardId: input.wardId,
    meetingId,
    documentType: 'SACRAMENT_PROGRAM',
    sourceTemplateId: input.document.payload.sourceTemplateId,
    sourceTemplateVersion: input.document.payload.sourceTemplateVersion,
    schemaVersion: input.document.payload.layout.schemaVersion,
    layout: input.document.payload.layout,
    theme: input.document.payload.theme,
    updatedByUserId: input.updatedByUserId,
    expectedRevision: input.expectedRevision
  });
  if (!row) return null;
  return {
    ...input.document,
    source: { ...input.document.source, sourceVersion: String((row as { revision: number }).revision) },
    revision: Number((row as { revision: number }).revision),
    updatedByUserId: (row as { updated_by_user_id?: string | null }).updated_by_user_id ?? null,
    updatedAt: (row as { updated_at?: Date | string | null }).updated_at ?? null
  };
}

export async function loadProgramDocument(
  client: Queryable,
  input: { wardId: string; meetingId: string }
): Promise<PersistedProgramDocument | null> {
  const registration = requireProgramRegistration('SACRAMENT_PROGRAM');
  const result = await client.query(
    `SELECT md.id, md.meeting_id, md.schema_version, md.layout_json, md.theme_json, md.source_template_id,
            md.source_template_version, md.revision, md.updated_by_user_id, md.updated_at,
            m.meeting_date
       FROM meeting_document md
       JOIN meeting m ON m.id = md.meeting_id AND m.ward_id = md.ward_id
      WHERE md.ward_id = $1::uuid AND md.meeting_id = $2::uuid AND md.document_type = 'SACRAMENT_PROGRAM'
      LIMIT 1`,
    [input.wardId, input.meetingId]
  );
  const row = result.rows[0] as
    | {
        meeting_id: string;
        schema_version: number;
        layout_json: unknown;
        theme_json: Record<string, unknown>;
        source_template_id?: string | null;
        source_template_version?: number | null;
        revision: number;
        updated_by_user_id?: string | null;
        updated_at?: Date | string | null;
        meeting_date: string;
      }
    | undefined;
  if (!row) return null;
  let parsedLayout: DocumentLayout | AdvancedDocumentLayout;
  try {
    const rawSchemaVersion =
      row.layout_json && typeof row.layout_json === 'object' && 'schemaVersion' in row.layout_json
        ? (row.layout_json as { schemaVersion?: unknown }).schemaVersion
        : undefined;
    if (rawSchemaVersion !== row.schema_version) {
      throw new Error('Persisted layout schema version does not match its database version.');
    }
    parsedLayout = row.schema_version === 2 ? parseAdvancedLayout(row.layout_json) : parseDocumentLayout(row.layout_json);
  } catch {
    throw new InvalidProgramPersistenceInputError('Persisted program layout failed schema validation.');
  }
  parsedLayout = ensureLegacyTitleProvenance(parsedLayout);
  const layoutSchemaVersion = parsedLayout.schemaVersion;
  if ((row.schema_version !== 1 && row.schema_version !== 2) || row.schema_version !== layoutSchemaVersion) {
    throw new InvalidProgramPersistenceInputError(`Unsupported or inconsistent persisted layout schema version: ${row.schema_version}`);
  }
  return {
    id: documentId(row.meeting_id),
    programType: registration.programType,
    source: { sourceType: registration.sourceType, sourceId: row.meeting_id, sourceVersion: String(row.revision) },
    schemaVersion: 1,
    metadata: { title: 'Sacrament Meeting', date: row.meeting_date, location: null },
    payload: {
      layout: parsedLayout,
      theme: row.theme_json,
      sourceTemplateId: row.source_template_id ?? null,
      sourceTemplateVersion: row.source_template_version ?? null
    },
    revision: Number(row.revision),
    updatedByUserId: row.updated_by_user_id ?? null,
    updatedAt: row.updated_at ?? null
  };
}
