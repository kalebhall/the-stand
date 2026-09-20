CREATE TABLE IF NOT EXISTS document_template (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('SYSTEM', 'STAKE', 'WARD', 'PERSONAL_DRAFT')),
  scope_id UUID,
  document_type TEXT NOT NULL CHECK (document_type = 'SACRAMENT_PROGRAM'),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  current_published_version_id UUID,
  created_by_user_id UUID REFERENCES user_account(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((scope_type = 'SYSTEM' AND scope_id IS NULL) OR (scope_type <> 'SYSTEM' AND scope_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS document_template_version (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES document_template(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  layout_json JSONB NOT NULL,
  theme_json JSONB NOT NULL,
  lock_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID REFERENCES user_account(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);

ALTER TABLE document_template
  ADD CONSTRAINT document_template_current_version_fk
  FOREIGN KEY (current_published_version_id)
  REFERENCES document_template_version(id)
  ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS meeting_document (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES ward(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES meeting(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type = 'SACRAMENT_PROGRAM'),
  source_template_id UUID REFERENCES document_template(id) ON DELETE SET NULL,
  source_template_version INTEGER,
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  layout_json JSONB NOT NULL,
  theme_json JSONB NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_by_user_id UUID REFERENCES user_account(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ward_id, meeting_id, document_type)
);

CREATE TABLE IF NOT EXISTS ward_document_settings (
  ward_id UUID PRIMARY KEY REFERENCES ward(id) ON DELETE CASCADE,
  default_sacrament_template_id UUID REFERENCES document_template(id) ON DELETE SET NULL,
  allow_advanced_program_designer BOOLEAN NOT NULL DEFAULT false,
  allow_program_editor_publish BOOLEAN NOT NULL DEFAULT false,
  allow_program_editor_republish BOOLEAN NOT NULL DEFAULT false,
  allow_program_editor_rollback BOOLEAN NOT NULL DEFAULT false,
  allow_program_editor_create_templates BOOLEAN NOT NULL DEFAULT false,
  allow_program_editor_delete_media BOOLEAN NOT NULL DEFAULT false,
  public_program_expiration_days INTEGER CHECK (public_program_expiration_days IS NULL OR public_program_expiration_days > 0),
  updated_by_user_id UUID REFERENCES user_account(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_template_scope_status_type_idx
  ON document_template (scope_type, scope_id, status, document_type);
CREATE INDEX IF NOT EXISTS document_template_version_template_created_idx
  ON document_template_version (template_id, created_at DESC);
CREATE INDEX IF NOT EXISTS meeting_document_ward_meeting_idx
  ON meeting_document (ward_id, meeting_id, document_type);

ALTER TABLE document_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_template FORCE ROW LEVEL SECURITY;
ALTER TABLE document_template_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_template_version FORCE ROW LEVEL SECURITY;
ALTER TABLE meeting_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_document FORCE ROW LEVEL SECURITY;
ALTER TABLE ward_document_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ward_document_settings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_template_read ON document_template;
CREATE POLICY document_template_read ON document_template
  FOR SELECT USING (
    scope_type = 'SYSTEM' OR
    (scope_type = 'STAKE' AND EXISTS (
      SELECT 1 FROM ward w
      WHERE w.id = app.current_ward_id() AND w.stake_id = document_template.scope_id
    )) OR
    (scope_type = 'WARD' AND scope_id = app.current_ward_id()) OR
    (scope_type = 'PERSONAL_DRAFT' AND scope_id = app.current_ward_id() AND created_by_user_id = app.current_user_id())
  );
DROP POLICY IF EXISTS document_template_write ON document_template;
CREATE POLICY document_template_write ON document_template
  FOR ALL USING (
    (scope_type = 'WARD' AND scope_id = app.current_ward_id()) OR
    (scope_type = 'PERSONAL_DRAFT' AND scope_id = app.current_ward_id() AND created_by_user_id = app.current_user_id())
  ) WITH CHECK (
    (scope_type = 'WARD' AND scope_id = app.current_ward_id()) OR
    (scope_type = 'PERSONAL_DRAFT' AND scope_id = app.current_ward_id() AND created_by_user_id = app.current_user_id())
  );

DROP POLICY IF EXISTS document_template_version_read ON document_template_version;
CREATE POLICY document_template_version_read ON document_template_version
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM document_template t
      WHERE t.id = template_id
        AND (
          t.scope_type = 'SYSTEM' OR
          (t.scope_type = 'STAKE' AND EXISTS (
            SELECT 1 FROM ward w
            WHERE w.id = app.current_ward_id() AND w.stake_id = t.scope_id
          )) OR
          (t.scope_type = 'WARD' AND t.scope_id = app.current_ward_id()) OR
          (t.scope_type = 'PERSONAL_DRAFT' AND t.scope_id = app.current_ward_id() AND t.created_by_user_id = app.current_user_id())
        )
    )
  );
DROP POLICY IF EXISTS document_template_version_write ON document_template_version;
CREATE POLICY document_template_version_write ON document_template_version
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM document_template t
      WHERE t.id = template_id
        AND t.scope_type IN ('WARD', 'PERSONAL_DRAFT')
        AND t.scope_id = app.current_ward_id()
        AND (t.scope_type = 'WARD' OR t.created_by_user_id = app.current_user_id())
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM document_template t
      WHERE t.id = template_id
        AND t.scope_type IN ('WARD', 'PERSONAL_DRAFT')
        AND t.scope_id = app.current_ward_id()
        AND (t.scope_type = 'WARD' OR t.created_by_user_id = app.current_user_id())
    )
  );

DROP POLICY IF EXISTS meeting_document_isolation ON meeting_document;
CREATE POLICY meeting_document_isolation ON meeting_document
  USING (
    ward_id = app.current_ward_id()
    AND EXISTS (SELECT 1 FROM meeting m WHERE m.id = meeting_document.meeting_id AND m.ward_id = meeting_document.ward_id)
  )
  WITH CHECK (
    ward_id = app.current_ward_id()
    AND EXISTS (SELECT 1 FROM meeting m WHERE m.id = meeting_document.meeting_id AND m.ward_id = meeting_document.ward_id)
  );

DROP POLICY IF EXISTS ward_document_settings_isolation ON ward_document_settings;
CREATE POLICY ward_document_settings_isolation ON ward_document_settings
  USING (ward_id = app.current_ward_id())
  WITH CHECK (ward_id = app.current_ward_id());
