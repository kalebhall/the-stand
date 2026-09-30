import { parseProgramDocument, type ProgramDocument } from './contracts';
import { baptismProgramPayloadSchema, type BaptismProgramPayload } from './baptism-adapter';
import { InvalidProgramPersistenceInputError } from './persistence';
import type { Queryable } from '@/src/document-designer/persistence';

export type PersistedBaptismProgramDocument = ProgramDocument<BaptismProgramPayload> & {
  revision: number;
  updatedByUserId: string | null;
  updatedAt: Date | string | null;
};

function requireBaptismDocument(document: ProgramDocument): ProgramDocument<BaptismProgramPayload> {
  if (document.programType !== 'BAPTISM_PROGRAM' || document.source.sourceType !== 'BAPTISM_EVENT') {
    throw new InvalidProgramPersistenceInputError('Baptism persistence requires a BAPTISM_PROGRAM/BAPTISM_EVENT document.');
  }
  const parsed = parseProgramDocument(document);
  const payload = baptismProgramPayloadSchema.parse(parsed.payload);
  if (parsed.id !== `baptism-event-program:${parsed.source.sourceId}`) {
    throw new InvalidProgramPersistenceInputError('Baptism document ID must match its source event.');
  }
  if (parsed.source.sourceVersion == null) {
    throw new InvalidProgramPersistenceInputError('Baptism persistence requires a source version.');
  }
  return { ...parsed, payload } as ProgramDocument<BaptismProgramPayload>;
}

function mapPersisted(row: Record<string, unknown>): PersistedBaptismProgramDocument {
  if (Number(row.schema_version) !== 1) throw new InvalidProgramPersistenceInputError(`Unsupported baptism program schema version: ${row.schema_version}`);
  const document = requireBaptismDocument(row.document_json as ProgramDocument);
  if (document.source.sourceId !== String(row.source_id) || document.source.sourceVersion !== String(row.source_version)) {
    throw new InvalidProgramPersistenceInputError('Persisted baptism document source identity is inconsistent.');
  }
  return {
    ...document,
    source: { ...document.source, sourceVersion: row.source_version == null ? null : String(row.source_version) },
    revision: Number(row.revision),
    updatedByUserId: (row.updated_by_user_id as string | null | undefined) ?? null,
    updatedAt: (row.updated_at as Date | string | null | undefined) ?? null
  };
}

export async function saveBaptismProgramDocument(
  client: Queryable,
  input: {
    wardId: string;
    document: ProgramDocument<BaptismProgramPayload>;
    expectedRevision?: number;
  }
): Promise<PersistedBaptismProgramDocument | null> {
  const document = requireBaptismDocument(input.document);
  const expectedRevision = input.expectedRevision ?? 0;
  const result = await client.query(
    `WITH source AS (
       SELECT ward_id, source_version
         FROM program_source_event
        WHERE ward_id = $1::uuid AND source_type = 'BAPTISM_EVENT' AND source_id = $2::text
        FOR UPDATE
     ), upsert AS (
       INSERT INTO program_document
       (ward_id, program_type, source_type, source_id, source_version, schema_version, document_json, revision, updated_by_user_id)
     SELECT $1::uuid, $3::text, $4::text, $2::text, source.source_version, $5::int,
            jsonb_set($6::jsonb, '{source,sourceVersion}', to_jsonb(source.source_version), true), 1,
            app.current_user_id()
       FROM source
      WHERE source.source_version = $7::text
     ON CONFLICT (ward_id, program_type, source_type, source_id) DO UPDATE SET
       source_version = EXCLUDED.source_version,
       schema_version = EXCLUDED.schema_version,
       document_json = EXCLUDED.document_json,
       revision = program_document.revision + 1,
       updated_by_user_id = app.current_user_id(),
       updated_at = now()
     WHERE program_document.revision = $8::int
     RETURNING id, program_type, source_type, source_id, source_version, schema_version, document_json, revision, updated_by_user_id, updated_at
     ) SELECT * FROM upsert`,
    [input.wardId, document.source.sourceId, document.programType, document.source.sourceType, document.schemaVersion, JSON.stringify(document), document.source.sourceVersion, expectedRevision]
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? mapPersisted(row) : null;
}

export async function loadBaptismProgramDocument(
  client: Queryable,
  input: { wardId: string; eventId: string }
): Promise<PersistedBaptismProgramDocument | null> {
  const result = await client.query(
    `SELECT id, program_type, source_type, source_id, source_version, schema_version, document_json, revision, updated_by_user_id, updated_at
       FROM program_document
      WHERE ward_id = $1::uuid AND program_type = 'BAPTISM_PROGRAM' AND source_type = 'BAPTISM_EVENT' AND source_id = $2::text
      LIMIT 1`,
    [input.wardId, input.eventId]
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? mapPersisted(row) : null;
}
