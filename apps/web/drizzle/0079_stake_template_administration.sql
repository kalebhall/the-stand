-- Milestone 9: explicit stake administration tenancy. Forward-only and rerunnable.
-- The legacy role constraint allowed only GLOBAL/WARD, so widen it before
-- seeding the first STAKE-scoped role. Migration 0081 repeats this operation
-- as a forward repair for databases where 0079 was already applied.
ALTER TABLE public.role DROP CONSTRAINT IF EXISTS role_scope_check;
ALTER TABLE public.role
  ADD CONSTRAINT role_scope_check CHECK (scope IN ('GLOBAL', 'WARD', 'STAKE'));

INSERT INTO public.role (name, scope)
VALUES ('STAKE_ADMIN', 'STAKE')
ON CONFLICT (name) DO UPDATE SET scope = EXCLUDED.scope;

CREATE TABLE IF NOT EXISTS public.stake_user_role (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stake_id UUID NOT NULL REFERENCES public.stake(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.user_account(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.role(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by_user_id UUID REFERENCES public.user_account(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  revoked_by_user_id UUID REFERENCES public.user_account(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT stake_user_role_unique UNIQUE (stake_id, user_id, role_id),
  CONSTRAINT stake_user_role_revocation_order CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
);
CREATE INDEX IF NOT EXISTS stake_user_role_stake_user_idx ON public.stake_user_role (stake_id, user_id);
CREATE INDEX IF NOT EXISTS stake_user_role_user_active_idx ON public.stake_user_role (user_id, revoked_at);

-- This helper is SECURITY DEFINER because it is called by a FORCE-RLS policy on
-- stake_user_role itself.  row_security=off prevents the policy from re-entering
-- app.is_stake_admin() recursively.  The function has no user-controlled SQL and
-- still derives identity from the transaction-local app.user_id setting.
CREATE OR REPLACE FUNCTION app.is_stake_admin(target_stake_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app
SET row_security = off
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

CREATE OR REPLACE FUNCTION app.can_administer_system_templates()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_account u
      JOIN public.user_global_role ugr ON ugr.user_id = u.id
      JOIN public.role r ON r.id = ugr.role_id
     WHERE u.id = app.current_user_id()
       AND u.is_active = true
       AND r.name IN ('SYSTEM_ADMIN', 'SUPPORT_ADMIN')
       AND r.scope = 'GLOBAL'
  )
$$;

REVOKE ALL ON FUNCTION app.can_administer_system_templates() FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.is_system_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_account u
      JOIN public.user_global_role ugr ON ugr.user_id = u.id
      JOIN public.role r ON r.id = ugr.role_id
     WHERE u.id = app.current_user_id()
       AND u.is_active = true
       AND r.name = 'SYSTEM_ADMIN'
       AND r.scope = 'GLOBAL'
  )
$$;

REVOKE ALL ON FUNCTION app.is_system_admin() FROM PUBLIC;

ALTER TABLE public.stake_user_role ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stake_user_role FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stake_user_role_read ON public.stake_user_role;
CREATE POLICY stake_user_role_read ON public.stake_user_role FOR SELECT USING (
  user_id = app.current_user_id()
  OR app.is_system_admin()
  OR app.is_stake_admin(stake_id)
);
DROP POLICY IF EXISTS stake_user_role_write ON public.stake_user_role;
CREATE POLICY stake_user_role_write ON public.stake_user_role FOR ALL USING (
  app.is_system_admin()
  OR app.is_stake_admin(stake_id)
) WITH CHECK (
  (app.is_system_admin() OR app.is_stake_admin(stake_id))
  AND EXISTS (
    SELECT 1 FROM public.role target
     WHERE target.id = stake_user_role.role_id
       AND target.name = 'STAKE_ADMIN'
       AND target.scope = 'STAKE'
  )
);

REVOKE ALL ON FUNCTION app.is_stake_admin(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.is_system_admin() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stand_user') THEN
    GRANT EXECUTE ON FUNCTION app.can_administer_system_templates() TO stand_user;
    GRANT EXECUTE ON FUNCTION app.is_stake_admin(UUID) TO stand_user;
    GRANT EXECUTE ON FUNCTION app.is_system_admin() TO stand_user;
  END IF;
END
$$;
