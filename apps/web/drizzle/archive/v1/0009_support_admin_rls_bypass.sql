-- Allow SUPPORT_ADMIN users to read and write ward_user_role across all wards.
-- The existing ward_user_role_isolation policy restricts access to the current
-- ward context. Support admins need cross-ward access for user management.

CREATE OR REPLACE FUNCTION app.is_support_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM user_global_role ugr
      JOIN role r ON r.id = ugr.role_id
     WHERE ugr.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
       AND r.name = 'SUPPORT_ADMIN'
  )
$$;

DROP POLICY IF EXISTS ward_user_role_support_admin ON ward_user_role;
CREATE POLICY ward_user_role_support_admin ON ward_user_role
  USING (app.is_support_admin())
  WITH CHECK (app.is_support_admin());
