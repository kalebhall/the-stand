-- Rich audit logging metadata and indexes
ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS actor_name TEXT,
  ADD COLUMN IF NOT EXISTS actor_role TEXT,
  ADD COLUMN IF NOT EXISTS target_member_id UUID,
  ADD COLUMN IF NOT EXISTS target_member_name TEXT,
  ADD COLUMN IF NOT EXISTS entity_type TEXT,
  ADD COLUMN IF NOT EXISTS entity_id TEXT,
  ADD COLUMN IF NOT EXISTS changes JSONB,
  ADD COLUMN IF NOT EXISTS previous_state JSONB,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual_ui',
  ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS is_cross_ward_support BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS calling_name TEXT,
  ADD COLUMN IF NOT EXISTS organization TEXT,
  ADD COLUMN IF NOT EXISTS calling_status TEXT,
  ADD COLUMN IF NOT EXISTS effective_date DATE,
  ADD COLUMN IF NOT EXISTS meeting_date DATE,
  ADD COLUMN IF NOT EXISTS item_type TEXT,
  ADD COLUMN IF NOT EXISTS item_title TEXT,
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS session_id TEXT;

CREATE INDEX IF NOT EXISTS audit_log_ward_id_idx ON audit_log (ward_id);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_target_member_id_idx ON audit_log (target_member_id);
CREATE INDEX IF NOT EXISTS audit_log_entity_type_idx ON audit_log (entity_type);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log (action);
