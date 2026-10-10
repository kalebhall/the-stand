-- Close remaining template scope, publication-history, and archive immutability gaps.

CREATE OR REPLACE FUNCTION app.can_manage_ward_program_templates(target_ward_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app
SET row_security = on
AS $$
  SELECT target_ward_id = app.current_ward_id()
     AND EXISTS (
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

DROP POLICY IF EXISTS document_template_version_read ON public.document_template_version;
CREATE POLICY document_template_version_read ON public.document_template_version FOR SELECT USING (
  EXISTS (
    SELECT 1
      FROM public.document_template t
     WHERE t.id = document_template_version.template_id
       AND (
         -- Administrators may inspect the complete history for their scope.
         ((t.scope_type = 'SYSTEM'::text) AND (t.scope_id IS NULL) AND app.can_administer_system_templates())
         OR ((t.scope_type = 'STAKE'::text) AND app.is_stake_admin(t.scope_id))
         OR ((t.scope_type = 'WARD'::text) AND t.scope_id = app.current_ward_id() AND app.can_manage_ward_program_templates(t.scope_id))
         OR ((t.scope_type = 'PERSONAL_DRAFT'::text) AND t.scope_id = app.current_ward_id() AND t.created_by_user_id = app.current_user_id())
         -- Ordinary consumers may read only the currently published version.
         OR ((t.scope_type = 'SYSTEM'::text)
             AND t.scope_id IS NULL
             AND t.status = 'PUBLISHED'::text
             AND t.current_published_version_id = document_template_version.id)
         OR ((t.scope_type = 'STAKE'::text)
             AND t.status = 'PUBLISHED'::text
             AND t.current_published_version_id = document_template_version.id
             AND app.has_active_ward_access(app.current_ward_id())
             AND EXISTS (
               SELECT 1 FROM public.ward w
                WHERE w.id = app.current_ward_id() AND w.stake_id = t.scope_id
             ))
         OR ((t.scope_type = 'WARD'::text)
             AND t.scope_id = app.current_ward_id()
             AND t.status = 'PUBLISHED'::text
             AND t.current_published_version_id = document_template_version.id
             AND app.has_active_ward_access(t.scope_id))
       )
  )
);

DROP POLICY IF EXISTS document_template_version_insert ON public.document_template_version;
CREATE POLICY document_template_version_insert ON public.document_template_version FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.document_template t
     WHERE t.id = document_template_version.template_id
       AND t.status <> 'ARCHIVED'
       AND (
         (t.scope_type = 'SYSTEM' AND app.can_administer_system_templates())
         OR (t.scope_type = 'STAKE' AND app.is_stake_admin(t.scope_id))
         OR (t.scope_type = 'WARD' AND app.can_manage_ward_program_templates(t.scope_id))
         OR (t.scope_type = 'PERSONAL_DRAFT' AND t.created_by_user_id = app.current_user_id() AND app.can_manage_ward_program_templates(t.scope_id))
       )
  )
);

DROP POLICY IF EXISTS document_template_version_update ON public.document_template_version;
CREATE POLICY document_template_version_update ON public.document_template_version FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.document_template t
     WHERE t.id = document_template_version.template_id
       AND t.status <> 'ARCHIVED'
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
       AND t.status <> 'ARCHIVED'
       AND (
         (t.scope_type = 'SYSTEM' AND app.can_administer_system_templates())
         OR (t.scope_type = 'STAKE' AND app.is_stake_admin(t.scope_id))
         OR (t.scope_type = 'WARD' AND app.can_manage_ward_program_templates(t.scope_id))
         OR (t.scope_type = 'PERSONAL_DRAFT' AND t.created_by_user_id = app.current_user_id() AND app.can_manage_ward_program_templates(t.scope_id))
       )
  )
);

DROP POLICY IF EXISTS document_template_version_delete ON public.document_template_version;
CREATE POLICY document_template_version_delete ON public.document_template_version FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.document_template t
     WHERE t.id = document_template_version.template_id
       AND t.status <> 'ARCHIVED'
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
  IF EXISTS (
    SELECT 1 FROM public.document_template t
     WHERE t.id = COALESCE(OLD.template_id, NEW.template_id)
       AND t.status = 'ARCHIVED'
  ) THEN
    RAISE EXCEPTION 'Archived template versions are immutable';
  END IF;
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
