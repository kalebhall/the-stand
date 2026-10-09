-- Harden the stake projection, template capability boundary, version authorship,
-- and publication-history immutability without rewriting applied migrations.

-- Backfill publication markers before restrictive application policies are
-- installed. The temporary NO FORCE state is transaction-local and restored
-- before this migration commits.
ALTER TABLE public.document_template_version ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE public.document_template_version NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.document_template_version DISABLE TRIGGER document_template_version_published_immutable;
UPDATE public.document_template_version v
   SET published_at = COALESCE(t.published_at, now())
  FROM public.document_template t
  JOIN public.document_template_version current_version
    ON current_version.id = t.current_published_version_id
   AND current_version.template_id = t.id
 WHERE t.published_at IS NOT NULL
   AND v.template_id = t.id
   AND v.version <= current_version.version
   AND v.published_at IS NULL;
ALTER TABLE public.document_template_version ENABLE TRIGGER document_template_version_published_immutable;
ALTER TABLE public.document_template_version FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION app.validate_document_template_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app
AS $$
BEGIN
  IF NEW.scope_type = 'SYSTEM' THEN
    IF NEW.scope_id IS NOT NULL OR NEW.created_by_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'SYSTEM templates cannot have an owner scope';
    END IF;
  ELSIF NEW.scope_type = 'STAKE' THEN
    IF NOT EXISTS (SELECT 1 FROM public.stake s WHERE s.id = NEW.scope_id) THEN
      RAISE EXCEPTION 'STAKE template scope must reference a stake';
    END IF;
  ELSIF NEW.scope_type IN ('WARD', 'PERSONAL_DRAFT') THEN
    IF NOT EXISTS (SELECT 1 FROM public.ward w WHERE w.id = NEW.scope_id) THEN
      RAISE EXCEPTION 'WARD template scope must reference a ward';
    END IF;
    IF NEW.scope_type = 'PERSONAL_DRAFT' AND NEW.created_by_user_id IS DISTINCT FROM app.current_user_id() THEN
      RAISE EXCEPTION 'PERSONAL_DRAFT templates must belong to the current user' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported template scope';
  END IF;
  RETURN NEW;
END;
$$;

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

DROP POLICY IF EXISTS stake_user_role_read ON public.stake_user_role;
CREATE POLICY stake_user_role_read ON public.stake_user_role FOR SELECT USING (
  user_id = app.current_user_id()
  OR app.is_system_admin()
  OR app.is_stake_admin(stake_user_role.stake_id)
);

CREATE OR REPLACE FUNCTION app.can_manage_ward_program_templates(target_ward_id UUID)
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
      JOIN public.ward_user_role wur ON wur.user_id = u.id
      JOIN public.role r ON r.id = wur.role_id
      LEFT JOIN public.ward_document_settings settings ON settings.ward_id = target_ward_id
     WHERE u.id = app.current_user_id()
       AND u.is_active = true
       AND wur.user_id = app.current_user_id()
       AND wur.ward_id = target_ward_id
       AND wur.revoked_at IS NULL
       AND (wur.expires_at IS NULL OR wur.expires_at > now())
       AND (
         r.name = 'STAND_ADMIN'
         OR (r.name = 'PROGRAM_EDITOR' AND COALESCE(settings.allow_program_editor_create_templates, false))
       )
  )
$$;

DROP POLICY IF EXISTS document_template_read ON public.document_template;
CREATE POLICY document_template_read ON public.document_template FOR SELECT USING (
  ((scope_type = 'SYSTEM'::text) AND (status = 'PUBLISHED'::text))
  OR ((scope_type = 'SYSTEM'::text) AND (scope_id IS NULL) AND app.can_administer_system_templates())
  OR ((scope_type = 'STAKE'::text) AND (app.is_stake_admin(scope_id) OR ((status = 'PUBLISHED'::text) AND app.has_active_ward_access(app.current_ward_id()) AND EXISTS (
    SELECT 1 FROM public.ward w
    WHERE w.id = app.current_ward_id() AND w.stake_id = document_template.scope_id
  ))))
  OR ((scope_type = 'WARD'::text) AND (scope_id = app.current_ward_id()) AND app.has_active_ward_access(scope_id))
  OR ((scope_type = 'PERSONAL_DRAFT'::text) AND (scope_id = app.current_ward_id()) AND app.has_active_ward_access(scope_id) AND (created_by_user_id = app.current_user_id()))
);

DROP POLICY IF EXISTS document_template_version_read ON public.document_template_version;
CREATE POLICY document_template_version_read ON public.document_template_version FOR SELECT USING (
  EXISTS (
    SELECT 1
      FROM public.document_template t
     WHERE t.id = document_template_version.template_id
       AND (
         ((t.scope_type = 'SYSTEM'::text) AND (t.scope_id IS NULL) AND app.can_administer_system_templates())
         OR ((t.scope_type = 'SYSTEM'::text) AND (t.status = 'PUBLISHED'::text))
         OR ((t.scope_type = 'STAKE'::text) AND (app.is_stake_admin(t.scope_id) OR ((t.status = 'PUBLISHED'::text) AND app.has_active_ward_access(app.current_ward_id()) AND EXISTS (
           SELECT 1 FROM public.ward w WHERE w.id = app.current_ward_id() AND w.stake_id = t.scope_id
         ))))
         OR ((t.scope_type = 'WARD'::text) AND (t.scope_id = app.current_ward_id()) AND app.has_active_ward_access(t.scope_id))
         OR ((t.scope_type = 'PERSONAL_DRAFT'::text) AND (t.scope_id = app.current_ward_id()) AND app.has_active_ward_access(t.scope_id) AND (t.created_by_user_id = app.current_user_id()))
       )
  )
);

DROP POLICY IF EXISTS document_template_write ON public.document_template;
DROP POLICY IF EXISTS document_template_insert ON public.document_template;
DROP POLICY IF EXISTS document_template_update ON public.document_template;
DROP POLICY IF EXISTS document_template_delete ON public.document_template;
CREATE POLICY document_template_insert ON public.document_template FOR INSERT WITH CHECK (
  (scope_type = 'SYSTEM' AND app.can_administer_system_templates())
  OR (scope_type = 'STAKE' AND app.is_stake_admin(scope_id))
  OR (scope_type = 'WARD' AND app.can_manage_ward_program_templates(scope_id))
  OR (scope_type = 'PERSONAL_DRAFT' AND created_by_user_id = app.current_user_id() AND app.can_manage_ward_program_templates(scope_id))
);
CREATE POLICY document_template_update ON public.document_template FOR UPDATE USING (
  (scope_type = 'SYSTEM' AND app.can_administer_system_templates())
  OR (scope_type = 'STAKE' AND app.is_stake_admin(scope_id))
  OR (scope_type = 'WARD' AND app.can_manage_ward_program_templates(scope_id))
  OR (scope_type = 'PERSONAL_DRAFT' AND created_by_user_id = app.current_user_id() AND app.can_manage_ward_program_templates(scope_id))
) WITH CHECK (
  (scope_type = 'SYSTEM' AND app.can_administer_system_templates())
  OR (scope_type = 'STAKE' AND app.is_stake_admin(scope_id))
  OR (scope_type = 'WARD' AND app.can_manage_ward_program_templates(scope_id))
  OR (scope_type = 'PERSONAL_DRAFT' AND created_by_user_id = app.current_user_id() AND app.can_manage_ward_program_templates(scope_id))
);
CREATE POLICY document_template_delete ON public.document_template FOR DELETE USING (
  (scope_type = 'SYSTEM' AND app.can_administer_system_templates())
  OR (scope_type = 'STAKE' AND app.is_stake_admin(scope_id))
  OR (scope_type = 'WARD' AND app.can_manage_ward_program_templates(scope_id))
  OR (scope_type = 'PERSONAL_DRAFT' AND created_by_user_id = app.current_user_id() AND app.can_manage_ward_program_templates(scope_id))
);

DROP POLICY IF EXISTS document_template_version_write ON public.document_template_version;
DROP POLICY IF EXISTS document_template_version_insert ON public.document_template_version;
DROP POLICY IF EXISTS document_template_version_update ON public.document_template_version;
DROP POLICY IF EXISTS document_template_version_delete ON public.document_template_version;
CREATE POLICY document_template_version_insert ON public.document_template_version FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.document_template t
     WHERE t.id = document_template_version.template_id
       AND (
         (t.scope_type = 'SYSTEM' AND app.can_administer_system_templates())
         OR (t.scope_type = 'STAKE' AND app.is_stake_admin(t.scope_id))
         OR (t.scope_type = 'WARD' AND app.can_manage_ward_program_templates(t.scope_id))
          OR (t.scope_type = 'PERSONAL_DRAFT' AND t.created_by_user_id = app.current_user_id() AND app.can_manage_ward_program_templates(t.scope_id))
       )
  )
);
CREATE POLICY document_template_version_update ON public.document_template_version FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.document_template t
     WHERE t.id = document_template_version.template_id
       AND (
         (t.scope_type = 'SYSTEM' AND app.can_administer_system_templates())
         OR (t.scope_type = 'STAKE' AND app.is_stake_admin(t.scope_id))
         OR (t.scope_type = 'WARD' AND app.can_manage_ward_program_templates(t.scope_id))
          OR (t.scope_type = 'PERSONAL_DRAFT' AND t.created_by_user_id = app.current_user_id() AND app.can_manage_ward_program_templates(t.scope_id))
       )
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.document_template t
     WHERE t.id = document_template_version.template_id
       AND (
         (t.scope_type = 'SYSTEM' AND app.can_administer_system_templates())
         OR (t.scope_type = 'STAKE' AND app.is_stake_admin(t.scope_id))
         OR (t.scope_type = 'WARD' AND app.can_manage_ward_program_templates(t.scope_id))
          OR (t.scope_type = 'PERSONAL_DRAFT' AND t.created_by_user_id = app.current_user_id() AND app.can_manage_ward_program_templates(t.scope_id))
       )
  )
);
CREATE POLICY document_template_version_delete ON public.document_template_version FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.document_template t
     WHERE t.id = document_template_version.template_id
       AND (
         (t.scope_type = 'SYSTEM' AND app.can_administer_system_templates())
         OR (t.scope_type = 'STAKE' AND app.is_stake_admin(t.scope_id))
         OR (t.scope_type = 'WARD' AND app.can_manage_ward_program_templates(t.scope_id))
          OR (t.scope_type = 'PERSONAL_DRAFT' AND t.created_by_user_id = app.current_user_id() AND app.can_manage_ward_program_templates(t.scope_id))
       )
  )
);

CREATE OR REPLACE FUNCTION app.prevent_published_template_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.published_at IS NULL
     AND NEW.published_at IS NOT NULL
     AND NEW.template_id = OLD.template_id
     AND NEW.version = OLD.version
     AND NEW.schema_version = OLD.schema_version
     AND NEW.layout_json = OLD.layout_json
     AND NEW.theme_json = OLD.theme_json
     AND NEW.lock_json = OLD.lock_json
     AND NEW.created_by_user_id IS NOT DISTINCT FROM OLD.created_by_user_id
     AND NEW.created_at = OLD.created_at
     AND EXISTS (
       SELECT 1 FROM public.document_template t
        WHERE t.id = NEW.template_id
          AND t.status = 'PUBLISHED'
          AND t.current_published_version_id = NEW.id
     ) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.published_at IS NULL AND NEW.published_at IS NOT NULL THEN
    RAISE EXCEPTION 'Publication markers may only be set by publication';
  END IF;
  IF OLD.published_at IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.document_template t
     WHERE t.id = COALESCE(OLD.template_id, NEW.template_id)
       AND t.status = 'PUBLISHED'
       AND t.current_published_version_id = COALESCE(OLD.id, NEW.id)
  ) THEN
    RAISE EXCEPTION 'Published template versions are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION app.mark_published_template_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app
SET row_security = on
AS $$
BEGIN
  IF NEW.status = 'PUBLISHED' AND NEW.current_published_version_id IS NOT NULL THEN
    UPDATE public.document_template_version
       SET published_at = COALESCE(published_at, COALESCE(NEW.published_at, now()))
     WHERE id = NEW.current_published_version_id
       AND template_id = NEW.id
       AND published_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS document_template_mark_published_version ON public.document_template;
CREATE TRIGGER document_template_mark_published_version
AFTER UPDATE OF status, current_published_version_id ON public.document_template
FOR EACH ROW EXECUTE FUNCTION app.mark_published_template_version();

CREATE OR REPLACE FUNCTION app.bind_template_version_author()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app
AS $$
DECLARE actor UUID := app.current_user_id();
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'template version author is required' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by_user_id := actor;
  ELSIF NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id THEN
    RAISE EXCEPTION 'template version author is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS document_template_version_bind_author ON public.document_template_version;
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

CREATE OR REPLACE FUNCTION app.bind_template_version_author()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app
AS $$
DECLARE actor UUID := app.current_user_id();
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'template version author is required' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by_user_id := actor;
  ELSIF NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id THEN
    RAISE EXCEPTION 'template version author is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS document_template_version_bind_author ON public.document_template_version;
CREATE TRIGGER document_template_version_bind_author
BEFORE INSERT OR UPDATE OF created_by_user_id ON public.document_template_version
FOR EACH ROW EXECUTE FUNCTION app.bind_template_version_author();
