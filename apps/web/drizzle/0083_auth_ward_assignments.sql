-- Read the authenticated user's active ward assignments without requiring a
-- single ward context. FORCE RLS on ward_user_role intentionally hides rows
-- when app.ward_id is unset; authentication must enumerate assignments before
-- an active ward can be selected.
CREATE OR REPLACE FUNCTION app.load_user_ward_access(p_user_id UUID)
RETURNS TABLE (
  ward_id UUID,
  stake_id UUID,
  role_name TEXT,
  is_support_assignment BOOLEAN,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
BEGIN
  IF p_user_id IS DISTINCT FROM app.current_user_id() THEN
    RAISE EXCEPTION 'authenticated user context does not match requested user'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT wur.ward_id,
         w.stake_id,
         r.name,
         wur.is_support_assignment,
         wur.expires_at,
         wur.revoked_at,
         wur.created_at
    FROM public.ward_user_role wur
    INNER JOIN public.ward w ON w.id = wur.ward_id
    INNER JOIN public.role r ON r.id = wur.role_id
   WHERE wur.user_id = p_user_id
     AND wur.revoked_at IS NULL
     AND (wur.expires_at IS NULL OR wur.expires_at > pg_catalog.now());
END;
$$;

REVOKE ALL ON FUNCTION app.load_user_ward_access(UUID) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stand_user') THEN
    GRANT EXECUTE ON FUNCTION app.load_user_ward_access(UUID) TO stand_user;
  END IF;
END
$$;
