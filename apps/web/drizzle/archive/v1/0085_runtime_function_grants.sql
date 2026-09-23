-- Correct runtime grants for SECURITY DEFINER authorization readers.
-- Do not grant these functions to PUBLIC or to the migration executor.
REVOKE ALL ON FUNCTION app.can_administer_system_templates() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.is_stake_admin(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.is_system_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.load_user_ward_access(UUID) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stand_user') THEN
    GRANT EXECUTE ON FUNCTION app.can_administer_system_templates() TO stand_user;
    GRANT EXECUTE ON FUNCTION app.is_stake_admin(UUID) TO stand_user;
    GRANT EXECUTE ON FUNCTION app.is_system_admin() TO stand_user;
    GRANT EXECUTE ON FUNCTION app.load_user_ward_access(UUID) TO stand_user;
  END IF;
END
$$;