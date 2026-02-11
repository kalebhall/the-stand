CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS stake (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ward (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stake_id UUID NOT NULL REFERENCES stake(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_account (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  password_hash TEXT,
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  last_password_change_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS role (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('GLOBAL', 'WARD'))
);

CREATE TABLE IF NOT EXISTS user_global_role (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES role(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS ward_user_role (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES ward(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES role(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ward_id, user_id, role_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID,
  user_id UUID,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ward_user_role ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ward_user_role_isolation ON ward_user_role;
CREATE POLICY ward_user_role_isolation ON ward_user_role
USING (ward_id = current_setting('app.ward_id', true)::uuid);

DROP POLICY IF EXISTS audit_log_isolation ON audit_log;
CREATE POLICY audit_log_isolation ON audit_log
USING (ward_id = current_setting('app.ward_id', true)::uuid OR ward_id IS NULL);
