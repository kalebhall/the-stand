import type { DocumentLayout } from './types';

export type QueryResult<T = Record<string, unknown>> = {
  rows: T[];
};

export type Queryable = {
  query: (text: string, values?: readonly unknown[]) => Promise<QueryResult>;
};

export type WardDocumentSettings = {
  ward_id: string;
  default_sacrament_template_id: string | null;
  allow_advanced_program_designer: boolean;
  allow_program_editor_publish: boolean;
  allow_program_editor_republish: boolean;
  allow_program_editor_rollback: boolean;
  allow_program_editor_create_templates: boolean;
  allow_program_editor_delete_media: boolean;
  public_program_expiration_days: number | null;
};

export type MeetingDocumentInput = {
  wardId: string;
  meetingId: string;
  documentType: 'SACRAMENT_PROGRAM';
  sourceTemplateId?: string | null;
  sourceTemplateVersion?: number | null;
  schemaVersion: number;
  layout: DocumentLayout;
  theme: Record<string, unknown>;
  updatedByUserId: string;
  expectedRevision?: number;
};

export const DEFAULT_WARD_DOCUMENT_SETTINGS: Omit<WardDocumentSettings, 'ward_id'> = {
  default_sacrament_template_id: null,
  allow_advanced_program_designer: false,
  allow_program_editor_publish: false,
  allow_program_editor_republish: false,
  allow_program_editor_rollback: false,
  allow_program_editor_create_templates: false,
  allow_program_editor_delete_media: false,
  public_program_expiration_days: null
};

export async function loadWardDocumentSettings(client: Queryable, wardId: string): Promise<WardDocumentSettings | null> {
  const result = await client.query(
    `SELECT ward_id,
            default_sacrament_template_id,
            allow_advanced_program_designer,
            allow_program_editor_publish,
            allow_program_editor_republish,
            allow_program_editor_rollback,
            allow_program_editor_create_templates,
            allow_program_editor_delete_media,
            public_program_expiration_days
       FROM ward_document_settings
      WHERE ward_id = $1::uuid
      LIMIT 1`,
    [wardId]
  );
  return (result.rows[0] as WardDocumentSettings | undefined) ?? null;
}

export function settingsResponse(row: WardDocumentSettings | null) {
  const value = row ?? ({ ward_id: '', ...DEFAULT_WARD_DOCUMENT_SETTINGS } satisfies WardDocumentSettings);
  return {
    defaultSacramentTemplateId: value.default_sacrament_template_id,
    allowAdvancedProgramDesigner: value.allow_advanced_program_designer,
    allowProgramEditorPublish: value.allow_program_editor_publish,
    allowProgramEditorRepublish: value.allow_program_editor_republish,
    allowProgramEditorRollback: value.allow_program_editor_rollback,
    allowProgramEditorCreateTemplates: value.allow_program_editor_create_templates,
    allowProgramEditorDeleteMedia: value.allow_program_editor_delete_media,
    publicProgramExpirationDays: value.public_program_expiration_days
  };
}

export async function saveWardDocumentSettings(
  client: Queryable,
  wardId: string,
  userId: string,
  settings: {
    allowAdvancedProgramDesigner: boolean;
    allowProgramEditorPublish: boolean;
    allowProgramEditorRepublish: boolean;
    allowProgramEditorRollback: boolean;
    allowProgramEditorCreateTemplates: boolean;
    allowProgramEditorDeleteMedia: boolean;
    publicProgramExpirationDays: number | null;
  }
): Promise<WardDocumentSettings> {
  const result = await client.query(
    `INSERT INTO ward_document_settings (
       ward_id,
       allow_advanced_program_designer,
       allow_program_editor_publish,
       allow_program_editor_republish,
       allow_program_editor_rollback,
       allow_program_editor_create_templates,
       allow_program_editor_delete_media,
       public_program_expiration_days,
       updated_by_user_id
     ) VALUES ($1::uuid, $2::boolean, $3::boolean, $4::boolean, $5::boolean, $6::boolean, $7::boolean, $8::int, $9::uuid)
     ON CONFLICT (ward_id) DO UPDATE SET
       allow_advanced_program_designer = EXCLUDED.allow_advanced_program_designer,
       allow_program_editor_publish = EXCLUDED.allow_program_editor_publish,
       allow_program_editor_republish = EXCLUDED.allow_program_editor_republish,
       allow_program_editor_rollback = EXCLUDED.allow_program_editor_rollback,
       allow_program_editor_create_templates = EXCLUDED.allow_program_editor_create_templates,
       allow_program_editor_delete_media = EXCLUDED.allow_program_editor_delete_media,
       public_program_expiration_days = EXCLUDED.public_program_expiration_days,
       updated_by_user_id = EXCLUDED.updated_by_user_id,
       updated_at = now()
     RETURNING ward_id,
       default_sacrament_template_id,
       allow_advanced_program_designer,
       allow_program_editor_publish,
       allow_program_editor_republish,
       allow_program_editor_rollback,
       allow_program_editor_create_templates,
       allow_program_editor_delete_media,
       public_program_expiration_days`,
    [
      wardId,
      settings.allowAdvancedProgramDesigner,
      settings.allowProgramEditorPublish,
      settings.allowProgramEditorRepublish,
      settings.allowProgramEditorRollback,
      settings.allowProgramEditorCreateTemplates,
      settings.allowProgramEditorDeleteMedia,
      settings.publicProgramExpirationDays,
      userId
    ]
  );
  if (!result.rows[0]) throw new Error('Settings write returned no row');
  return result.rows[0] as WardDocumentSettings;
}

export async function saveMeetingDocument(client: Queryable, input: MeetingDocumentInput) {
  const expectedRevision = input.expectedRevision ?? 0;
  await client.query('LOCK TABLE meeting_document IN ROW EXCLUSIVE MODE');
  const result = await client.query(
    `INSERT INTO meeting_document (
       ward_id, meeting_id, document_type, source_template_id, source_template_version,
       schema_version, layout_json, theme_json, revision, updated_by_user_id
     ) VALUES ($1::uuid, $2::uuid, $3::text, $4::uuid, $5::int, $6::int, $7::jsonb, $8::jsonb, 1, $9::uuid)
     ON CONFLICT (ward_id, meeting_id, document_type) DO UPDATE SET
       layout_json = EXCLUDED.layout_json,
       theme_json = EXCLUDED.theme_json,
       source_template_id = EXCLUDED.source_template_id,
       source_template_version = EXCLUDED.source_template_version,
       schema_version = EXCLUDED.schema_version,
       revision = meeting_document.revision + 1,
       updated_by_user_id = EXCLUDED.updated_by_user_id,
       updated_at = now()
     WHERE meeting_document.revision = $10::int
     RETURNING id, ward_id, meeting_id, document_type, source_template_id, source_template_version,
       schema_version, layout_json, theme_json, revision, updated_by_user_id, updated_at`,
    [
      input.wardId,
      input.meetingId,
      input.documentType,
      input.sourceTemplateId ?? null,
      input.sourceTemplateVersion ?? null,
      input.schemaVersion,
      JSON.stringify(input.layout),
      JSON.stringify(input.theme),
      input.updatedByUserId,
      expectedRevision
    ]
  );
  return result.rows[0] ?? null;
}
