-- Allow SUPPORT_ADMIN users to read and write audit_log across all wards.
-- Existing audit_log_isolation enforces ward scope; this policy bypasses that
-- for support administrators identified via app.is_support_admin().

DROP POLICY IF EXISTS audit_log_support_admin ON audit_log;
CREATE POLICY audit_log_support_admin ON audit_log
  USING (app.is_support_admin())
  WITH CHECK (app.is_support_admin());
