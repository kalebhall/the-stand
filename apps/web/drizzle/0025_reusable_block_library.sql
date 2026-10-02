-- Program Studio reusable blocks: scoped metadata plus immutable versions.
CREATE TABLE IF NOT EXISTS public.reusable_block (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type TEXT NOT NULL,
  scope_id UUID NOT NULL,
  owner_user_id UUID REFERENCES public.user_account(id) ON DELETE CASCADE,
  block_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  current_version INTEGER NOT NULL DEFAULT 0,
  created_by_user_id UUID REFERENCES public.user_account(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reusable_block_scope_type_check CHECK (scope_type IN ('PERSONAL', 'WARD', 'STAKE')),
  CONSTRAINT reusable_block_scope_owner_check CHECK ((scope_type = 'PERSONAL' AND owner_user_id IS NOT NULL) OR (scope_type IN ('WARD', 'STAKE') AND owner_user_id IS NULL)),
  CONSTRAINT reusable_block_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  CONSTRAINT reusable_block_status_check CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  CONSTRAINT reusable_block_version_positive_check CHECK (current_version >= 0),
  CONSTRAINT reusable_block_type_check CHECK (block_type IN ('CUSTOM_TEXT', 'IMAGE', 'DIVIDER', 'SPACER', 'QR_CODE', 'CUSTOM_LINK'))
);

CREATE TABLE IF NOT EXISTS public.reusable_block_version (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reusable_block_id UUID NOT NULL REFERENCES public.reusable_block(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  snapshot_json JSONB NOT NULL,
  created_by_user_id UUID REFERENCES public.user_account(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reusable_block_version_unique UNIQUE (reusable_block_id, version),
  CONSTRAINT reusable_block_version_positive_check CHECK (version > 0),
  CONSTRAINT reusable_block_snapshot_object_check CHECK (jsonb_typeof(snapshot_json) = 'object')
);

CREATE INDEX IF NOT EXISTS reusable_block_scope_idx ON public.reusable_block (scope_type, scope_id, status, block_type);
CREATE INDEX IF NOT EXISTS reusable_block_owner_idx ON public.reusable_block (owner_user_id, status);
CREATE INDEX IF NOT EXISTS reusable_block_version_created_idx ON public.reusable_block_version (reusable_block_id, created_at DESC);

ALTER TABLE public.reusable_block ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reusable_block FORCE ROW LEVEL SECURITY;
ALTER TABLE public.reusable_block_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reusable_block_version FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reusable_block_read ON public.reusable_block;
CREATE POLICY reusable_block_read ON public.reusable_block FOR SELECT USING (
  app.has_active_ward_access(app.current_ward_id()) AND status = 'ACTIVE' AND ((scope_type = 'PERSONAL' AND scope_id = app.current_ward_id() AND owner_user_id = app.current_user_id()) OR
  (scope_type = 'WARD' AND scope_id = app.current_ward_id()) OR
  (scope_type = 'STAKE' AND (app.is_stake_admin(scope_id) OR EXISTS (
    SELECT 1 FROM public.ward w WHERE w.id = app.current_ward_id() AND w.stake_id = reusable_block.scope_id
  )) ))
);

DROP POLICY IF EXISTS reusable_block_write ON public.reusable_block;
CREATE POLICY reusable_block_write ON public.reusable_block FOR ALL USING (
  app.has_active_ward_access(app.current_ward_id()) AND ((scope_type = 'PERSONAL' AND scope_id = app.current_ward_id() AND owner_user_id = app.current_user_id()) OR
  (scope_type = 'WARD' AND scope_id = app.current_ward_id()) OR
  (scope_type = 'STAKE' AND app.is_stake_admin(scope_id)))
) WITH CHECK (
  app.has_active_ward_access(app.current_ward_id()) AND ((scope_type = 'PERSONAL' AND scope_id = app.current_ward_id() AND owner_user_id = app.current_user_id()) OR
  (scope_type = 'WARD' AND scope_id = app.current_ward_id()) OR
  (scope_type = 'STAKE' AND app.is_stake_admin(scope_id)))
);

DROP POLICY IF EXISTS reusable_block_version_read ON public.reusable_block_version;
CREATE POLICY reusable_block_version_read ON public.reusable_block_version FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.reusable_block b WHERE b.id = reusable_block_version.reusable_block_id)
);

DROP POLICY IF EXISTS reusable_block_version_write ON public.reusable_block_version;
CREATE POLICY reusable_block_version_write ON public.reusable_block_version FOR INSERT WITH CHECK (
  app.has_active_ward_access(app.current_ward_id()) AND EXISTS (SELECT 1 FROM public.reusable_block b WHERE b.id = reusable_block_version.reusable_block_id AND b.status = 'ACTIVE' AND ((b.scope_type = 'PERSONAL' AND b.scope_id = app.current_ward_id() AND b.owner_user_id = app.current_user_id()) OR (b.scope_type = 'WARD' AND b.scope_id = app.current_ward_id()) OR (b.scope_type = 'STAKE' AND app.is_stake_admin(b.scope_id))))
);

CREATE OR REPLACE FUNCTION app.prevent_reusable_block_scope_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, app AS $$
BEGIN
  IF NEW.scope_type IS DISTINCT FROM OLD.scope_type OR NEW.scope_id IS DISTINCT FROM OLD.scope_id OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id THEN
    RAISE EXCEPTION 'Reusable block scope is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS reusable_block_scope_immutable ON public.reusable_block;
CREATE TRIGGER reusable_block_scope_immutable
BEFORE UPDATE ON public.reusable_block
FOR EACH ROW EXECUTE FUNCTION app.prevent_reusable_block_scope_mutation();

CREATE OR REPLACE FUNCTION app.validate_reusable_block_version()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, app AS $$
BEGIN
  NEW.created_by_user_id := app.current_user_id();
  UPDATE public.reusable_block
     SET current_version = NEW.version, updated_at = now()
   WHERE id = NEW.reusable_block_id AND current_version = NEW.version - 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reusable block version must be the next sequential version' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS reusable_block_version_validate ON public.reusable_block_version;
CREATE TRIGGER reusable_block_version_validate
BEFORE INSERT ON public.reusable_block_version
FOR EACH ROW EXECUTE FUNCTION app.validate_reusable_block_version();

CREATE OR REPLACE FUNCTION app.set_reusable_block_creator()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, app AS $$
BEGIN
  NEW.created_by_user_id := app.current_user_id();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS reusable_block_creator_identity ON public.reusable_block;
CREATE TRIGGER reusable_block_creator_identity
BEFORE INSERT ON public.reusable_block
FOR EACH ROW EXECUTE FUNCTION app.set_reusable_block_creator();

CREATE OR REPLACE FUNCTION app.prevent_reusable_block_version_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, app AS $$
BEGIN
  RAISE EXCEPTION 'Reusable block versions are immutable' USING ERRCODE = '55000';
END;
$$;
DROP TRIGGER IF EXISTS reusable_block_version_immutable ON public.reusable_block_version;
CREATE TRIGGER reusable_block_version_immutable
BEFORE UPDATE OR DELETE ON public.reusable_block_version
FOR EACH ROW EXECUTE FUNCTION app.prevent_reusable_block_version_mutation();
