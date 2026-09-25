-- Require an active global support-admin account for SECURITY DEFINER/RLS checks.
CREATE OR REPLACE FUNCTION app.is_support_admin() RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT EXISTS (
    SELECT 1
      FROM user_global_role ugr
      JOIN role r ON r.id = ugr.role_id
      JOIN user_account u ON u.id = ugr.user_id
     WHERE ugr.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
       AND r.name = 'SUPPORT_ADMIN'
       AND r.scope = 'GLOBAL'
       AND u.is_active = true
  )
$$;
