ALTER TABLE ward_user_role
  ADD COLUMN IF NOT EXISTS is_support_assignment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS granted_by_user_id uuid REFERENCES user_account(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS grant_reason text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by_user_id uuid REFERENCES user_account(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ward_user_role_active_assignment_idx
  ON ward_user_role (user_id, ward_id, created_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS ward_user_role_support_assignment_idx
  ON ward_user_role (user_id, ward_id, expires_at)
  WHERE is_support_assignment = true;
