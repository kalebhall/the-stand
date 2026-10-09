-- Preserve same-stake stake-admin UPDATE/DELETE authorization under FORCE RLS.
-- A separate internal authorization projection lets SELECT policy evaluation
-- identify stake administrators without recursively querying stake_user_role.
CREATE TABLE IF NOT EXISTS public.stake_admin_access (
  stake_id UUID NOT NULL REFERENCES public.stake(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.user_account(id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL UNIQUE REFERENCES public.stake_user_role(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (stake_id, user_id)
);
REVOKE ALL ON public.stake_admin_access FROM PUBLIC;

ALTER TABLE public.stake_user_role NO FORCE ROW LEVEL SECURITY;
INSERT INTO public.stake_admin_access (stake_id, user_id, assignment_id, granted_at)
SELECT sur.stake_id, sur.user_id, sur.id, sur.granted_at
  FROM public.stake_user_role sur
  JOIN public.role target ON target.id = sur.role_id
 WHERE target.name = 'STAKE_ADMIN'
   AND target.scope = 'STAKE'
   AND sur.revoked_at IS NULL
ON CONFLICT (stake_id, user_id) DO UPDATE
  SET assignment_id = EXCLUDED.assignment_id,
      granted_at = EXCLUDED.granted_at;
ALTER TABLE public.stake_user_role FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION app.is_stake_admin(target_stake_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app
SET row_security = on
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.stake_admin_access access
      JOIN public.user_account u ON u.id = access.user_id
     WHERE access.stake_id = target_stake_id
       AND access.user_id = app.current_user_id()
       AND access.granted_at <= now()
       AND u.is_active = true
  )
$$;

CREATE OR REPLACE FUNCTION app.sync_stake_admin_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app
SET row_security = on
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.revoked_at IS NULL
     AND EXISTS (
       SELECT 1 FROM public.role target
       WHERE target.id = NEW.role_id
         AND target.name = 'STAKE_ADMIN'
         AND target.scope = 'STAKE'
     ) THEN
    INSERT INTO public.stake_admin_access (stake_id, user_id, assignment_id, granted_at)
    VALUES (NEW.stake_id, NEW.user_id, NEW.id, NEW.granted_at)
    ON CONFLICT (stake_id, user_id) DO UPDATE
      SET assignment_id = EXCLUDED.assignment_id,
          granted_at = EXCLUDED.granted_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stake_user_role_sync_admin_access ON public.stake_user_role;
CREATE TRIGGER stake_user_role_sync_admin_access
AFTER INSERT OR UPDATE OR DELETE ON public.stake_user_role
FOR EACH ROW EXECUTE FUNCTION app.sync_stake_admin_access();

DROP POLICY IF EXISTS stake_user_role_read ON public.stake_user_role;
CREATE POLICY stake_user_role_read ON public.stake_user_role FOR SELECT USING (
  user_id = app.current_user_id()
  OR app.is_system_admin()
  OR app.is_stake_admin(stake_user_role.stake_id)
);

CREATE OR REPLACE FUNCTION app.is_stake_admin(target_stake_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app
SET row_security = on
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_account u
      JOIN public.stake_user_role sur ON sur.user_id = u.id
      JOIN public.role r ON r.id = sur.role_id
     WHERE u.id = app.current_user_id()
       AND u.is_active = true
       AND sur.stake_id = target_stake_id
       AND sur.revoked_at IS NULL
       AND sur.granted_at <= now()
       AND r.name = 'STAKE_ADMIN'
       AND r.scope = 'STAKE'
  )
$$;

CREATE OR REPLACE FUNCTION app.validate_stake_admin_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app
SET row_security = on
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.stake_user_role sur
      JOIN public.role r ON r.id = sur.role_id
     WHERE sur.id = NEW.assignment_id
       AND sur.stake_id = NEW.stake_id
       AND sur.user_id = NEW.user_id
       AND sur.revoked_at IS NULL
       AND r.name = 'STAKE_ADMIN'
       AND r.scope = 'STAKE'
       AND NEW.granted_at = sur.granted_at
  ) THEN
    RAISE EXCEPTION 'stake admin projection must reference an active STAKE_ADMIN assignment' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS stake_admin_access_validate ON public.stake_admin_access;
CREATE TRIGGER stake_admin_access_validate
BEFORE INSERT OR UPDATE ON public.stake_admin_access
FOR EACH ROW EXECUTE FUNCTION app.validate_stake_admin_access();

CREATE OR REPLACE FUNCTION app.sync_stake_admin_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app
SET row_security = on
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    ALTER TABLE public.stake_admin_access NO FORCE ROW LEVEL SECURITY;
    DELETE FROM public.stake_admin_access WHERE assignment_id = OLD.id;
    ALTER TABLE public.stake_admin_access FORCE ROW LEVEL SECURITY;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.revoked_at IS NULL
     AND EXISTS (
       SELECT 1 FROM public.role target
       WHERE target.id = NEW.role_id
         AND target.name = 'STAKE_ADMIN'
         AND target.scope = 'STAKE'
     ) THEN
    INSERT INTO public.stake_admin_access (stake_id, user_id, assignment_id, granted_at)
    VALUES (NEW.stake_id, NEW.user_id, NEW.id, NEW.granted_at)
    ON CONFLICT (stake_id, user_id) DO UPDATE
      SET assignment_id = EXCLUDED.assignment_id,
          granted_at = EXCLUDED.granted_at;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
DROP TRIGGER IF EXISTS stake_user_role_sync_admin_access ON public.stake_user_role;
DROP TRIGGER IF EXISTS stake_user_role_cleanup_admin_access ON public.stake_user_role;
CREATE TRIGGER stake_user_role_sync_admin_access
AFTER INSERT OR UPDATE OR DELETE ON public.stake_user_role
FOR EACH ROW EXECUTE FUNCTION app.sync_stake_admin_access();

CREATE OR REPLACE FUNCTION app.prevent_direct_stake_admin_access_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app
AS $$
BEGIN
  IF pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'stake admin projection is trigger-maintained' USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
DROP TRIGGER IF EXISTS stake_admin_access_prevent_direct_mutation ON public.stake_admin_access;
CREATE TRIGGER stake_admin_access_prevent_direct_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.stake_admin_access
FOR EACH ROW EXECUTE FUNCTION app.prevent_direct_stake_admin_access_mutation();

ALTER TABLE public.stake_admin_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stake_admin_access FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stake_admin_access_read ON public.stake_admin_access;
DROP POLICY IF EXISTS stake_admin_access_insert ON public.stake_admin_access;
DROP POLICY IF EXISTS stake_admin_access_update ON public.stake_admin_access;
DROP POLICY IF EXISTS stake_admin_access_delete ON public.stake_admin_access;
CREATE POLICY stake_admin_access_read ON public.stake_admin_access FOR SELECT USING (
  user_id = app.current_user_id() OR app.is_system_admin() OR app.is_stake_admin(stake_id)
);
CREATE POLICY stake_admin_access_insert ON public.stake_admin_access FOR INSERT WITH CHECK (
  app.is_system_admin() OR app.is_stake_admin(stake_id)
);
CREATE POLICY stake_admin_access_update ON public.stake_admin_access FOR UPDATE USING (
  app.is_system_admin() OR app.is_stake_admin(stake_id)
) WITH CHECK (
  app.is_system_admin() OR app.is_stake_admin(stake_id)
);
CREATE POLICY stake_admin_access_delete ON public.stake_admin_access FOR DELETE USING (
  app.is_system_admin() OR app.is_stake_admin(stake_id)
);

