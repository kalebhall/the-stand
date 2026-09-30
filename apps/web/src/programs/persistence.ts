import type { DocumentLayout } from '@/src/document-designer/types';
import { saveMeetingDocument, type Queryable } from '@/src/document-designer/persistence';

import type { ProgramDocument, ProgramSourceRef } from './contracts';
import { requireProgramRegistration } from './service';

export type SacramentProgramPersistencePayload = {
  layout: DocumentLayout;
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

export async function loadProgramDocumentRecord(client: Queryable, input: { wardId: string; meetingId: string }): Promise<LegacyProgramDocumentRow | null> {
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
  if (existing.rows[0]) return existing.rows[0] as LegacyProgramDocumentRow;
  const inserted = await client.query(
    `INSERT INTO meeting_document (ward_id, meeting_id, document_type, source_template_id, source_template_version, schema_version, layout_json, theme_json, revision, updated_by_user_id)
     VALUES ($1::uuid, $2::uuid, 'SACRAMENT_PROGRAM', NULL, NULL, $3::int, $4::jsonb, $5::jsonb, 1, $6::uuid)
     RETURNING id, source_template_id, source_template_version, schema_version, layout_json, theme_json, revision`,
    [input.wardId, input.meetingId, input.defaultLayout.schemaVersion, JSON.stringify(input.defaultLayout), JSON.stringify(input.defaultLayout.theme), input.userId]
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
    [input.id, input.wardId, input.schemaVersion, input.sourceTemplateId, input.sourceTemplateVersion, JSON.stringify(input.layout), JSON.stringify(input.theme), input.updatedByUserId, input.expectedRevision]
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
  const meetingId = requireStandMeetingSource(input.document.source);
  const row = await saveMeetingDocument(client, {
    wardId: input.wardId,
    meetingId,
    documentType: 'SACRAMENT_PROGRAM',
    sourceTemplateId: input.document.payload.sourceTemplateId,
    sourceTemplateVersion: input.document.payload.sourceTemplateVersion,
    schemaVersion: input.document.schemaVersion,
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
  const row = result.rows[0] as {
    meeting_id: string;
    schema_version: number;
    layout_json: DocumentLayout;
    theme_json: Record<string, unknown>;
    source_template_id?: string | null;
    source_template_version?: number | null;
    revision: number;
    updated_by_user_id?: string | null;
    updated_at?: Date | string | null;
    meeting_date: string;
  } | undefined;
  if (!row) return null;
  if (row.schema_version !== 1) throw new InvalidProgramPersistenceInputError(`Unsupported persisted program schema version: ${row.schema_version}`);
  return {
    id: documentId(row.meeting_id),
    programType: registration.programType,
    source: { sourceType: registration.sourceType, sourceId: row.meeting_id, sourceVersion: String(row.revision) },
    schemaVersion: 1,
    metadata: { title: 'Sacrament Meeting', date: row.meeting_date, location: null },
    payload: {
      layout: row.layout_json,
      theme: row.theme_json,
      sourceTemplateId: row.source_template_id ?? null,
      sourceTemplateVersion: row.source_template_version ?? null
    },
    revision: Number(row.revision),
    updatedByUserId: row.updated_by_user_id ?? null,
    updatedAt: row.updated_at ?? null
  };
}
