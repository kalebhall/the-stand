import { documentLayoutSchema } from './schema';
import type { ProgramPermissionProfile } from '@/src/auth/roles';

export type TemplateDbRow = {
  id: string;
  template_key: string | null;
  scope_type: 'SYSTEM' | 'STAKE' | 'WARD' | 'PERSONAL_DRAFT';
  scope_id: string | null;
  document_type: 'SACRAMENT_PROGRAM';
  name: string;
  description: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  current_published_version_id: string | null;
  created_by_user_id: string | null;
};

export type TemplateClient = {
  query: (text: string, values?: readonly unknown[]) => Promise<{ rows: unknown[]; rowCount?: number | null }>;
};

export function parseTemplateLayout(input: unknown) {
  return documentLayoutSchema.parse(input);
}

export async function loadProgramPermissionProfile(client: TemplateClient, wardId: string): Promise<ProgramPermissionProfile> {
  const result = await client.query(
    `SELECT allow_program_editor_create_templates,
            allow_program_editor_publish,
            allow_program_editor_republish,
            allow_program_editor_rollback,
            allow_advanced_program_designer
       FROM ward_document_settings
      WHERE ward_id = $1::uuid
      LIMIT 1`,
    [wardId]
  );
  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  return {
    allowProgramEditorCreateTemplates: row?.allow_program_editor_create_templates === true,
    allowProgramEditorPublish: row?.allow_program_editor_publish === true,
    allowProgramEditorRepublish: row?.allow_program_editor_republish === true,
    allowProgramEditorRollback: row?.allow_program_editor_rollback === true,
    allowAdvancedProgramDesigner: row?.allow_advanced_program_designer === true
  };
}

export function canEditTemplate(
  template: Pick<TemplateDbRow, 'scope_type' | 'scope_id' | 'created_by_user_id'>,
  wardId: string,
  userId: string,
  profile: ProgramPermissionProfile
): boolean {
  if (template.scope_type === 'WARD' && template.scope_id === wardId) return profile.allowProgramEditorCreateTemplates === true;
  if (template.scope_type === 'PERSONAL_DRAFT' && template.created_by_user_id === userId) return true;
  return false;
}

export function templateResponse(row: TemplateDbRow, version?: Record<string, unknown> | null) {
  return {
    id: row.id,
    key: row.template_key,
    source: row.scope_type === 'SYSTEM' ? 'BUILT_IN' : row.scope_type,
    scopeType: row.scope_type,
    name: row.name,
    description: row.description,
    documentType: row.document_type,
    status: row.status,
    version: version
      ? {
          id: version.id,
          version: version.version,
          schemaVersion: version.schema_version,
          layout: version.layout_json,
          theme: version.theme_json,
          lock: version.lock_json
        }
      : null
  };
}
