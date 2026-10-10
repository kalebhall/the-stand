-- Align matching-stake STAKE_ADMIN ward-template administration with route/UI capability.
-- The target ward must remain the active ward and must belong to the administered stake.
CREATE OR REPLACE FUNCTION app.can_manage_ward_templates_as_stake_admin(target_ward_id UUID)
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
         FROM public.ward w
        WHERE w.id = target_ward_id
          AND app.is_stake_admin(w.stake_id)
     )
$$;

DROP POLICY IF EXISTS document_template_read ON public.document_template;
CREATE POLICY document_template_read ON public.document_template FOR SELECT USING (
  ((scope_type = 'SYSTEM'::text) AND (status = 'PUBLISHED'::text))
  OR ((scope_type = 'SYSTEM'::text) AND (scope_id IS NULL) AND app.can_administer_system_templates())
  OR ((scope_type = 'STAKE'::text) AND (app.is_stake_admin(scope_id) OR ((status = 'PUBLISHED'::text) AND app.has_active_ward_access(app.current_ward_id()) AND EXISTS (SELECT 1 FROM public.ward w WHERE w.id = app.current_ward_id() AND w.stake_id = document_template.scope_id))))
  OR ((scope_type = 'WARD'::text) AND scope_id = app.current_ward_id() AND (app.has_active_ward_access(scope_id) OR app.can_manage_ward_templates_as_stake_admin(scope_id)))
  OR ((scope_type = 'PERSONAL_DRAFT'::text) AND scope_id = app.current_ward_id() AND created_by_user_id = app.current_user_id() AND (app.has_active_ward_access(scope_id) OR app.can_manage_ward_templates_as_stake_admin(scope_id)))
);
DROP POLICY IF EXISTS document_template_insert ON public.document_template;
CREATE POLICY document_template_insert ON public.document_template FOR INSERT WITH CHECK (
  (scope_type = 'SYSTEM' AND app.can_administer_system_templates())
  OR (scope_type = 'STAKE' AND app.is_stake_admin(scope_id))
  OR (scope_type = 'WARD' AND (app.can_manage_ward_program_templates(scope_id) OR app.can_manage_ward_templates_as_stake_admin(scope_id)))
  OR (scope_type = 'PERSONAL_DRAFT' AND created_by_user_id = app.current_user_id() AND (app.can_manage_ward_program_templates(scope_id) OR app.can_manage_ward_templates_as_stake_admin(scope_id)))
);

DROP POLICY IF EXISTS document_template_update ON public.document_template;
CREATE POLICY document_template_update ON public.document_template FOR UPDATE USING (
  status <> 'ARCHIVED'::text
  AND (
    (scope_type = 'SYSTEM' AND app.can_administer_system_templates())
    OR (scope_type = 'STAKE' AND app.is_stake_admin(scope_id))
    OR (scope_type = 'WARD' AND (app.can_manage_ward_program_templates(scope_id) OR app.can_manage_ward_templates_as_stake_admin(scope_id)))
    OR (scope_type = 'PERSONAL_DRAFT' AND created_by_user_id = app.current_user_id() AND (app.can_manage_ward_program_templates(scope_id) OR app.can_manage_ward_templates_as_stake_admin(scope_id)))
  )
) WITH CHECK (
  (
    (scope_type = 'SYSTEM' AND app.can_administer_system_templates())
    OR (scope_type = 'STAKE' AND app.is_stake_admin(scope_id))
    OR (scope_type = 'WARD' AND (app.can_manage_ward_program_templates(scope_id) OR app.can_manage_ward_templates_as_stake_admin(scope_id)))
    OR (scope_type = 'PERSONAL_DRAFT' AND created_by_user_id = app.current_user_id() AND (app.can_manage_ward_program_templates(scope_id) OR app.can_manage_ward_templates_as_stake_admin(scope_id)))
  )
);

DROP POLICY IF EXISTS document_template_delete ON public.document_template;
CREATE POLICY document_template_delete ON public.document_template FOR DELETE USING (
  status <> 'ARCHIVED'::text
  AND (
    (scope_type = 'SYSTEM' AND app.can_administer_system_templates())
    OR (scope_type = 'STAKE' AND app.is_stake_admin(scope_id))
    OR (scope_type = 'WARD' AND (app.can_manage_ward_program_templates(scope_id) OR app.can_manage_ward_templates_as_stake_admin(scope_id)))
    OR (scope_type = 'PERSONAL_DRAFT' AND created_by_user_id = app.current_user_id() AND (app.can_manage_ward_program_templates(scope_id) OR app.can_manage_ward_templates_as_stake_admin(scope_id)))
  )
);

DROP POLICY IF EXISTS document_template_version_read ON public.document_template_version;
CREATE POLICY document_template_version_read ON public.document_template_version FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.document_template t
     WHERE t.id = document_template_version.template_id
       AND (
         ((t.scope_type = 'SYSTEM') AND t.scope_id IS NULL AND app.can_administer_system_templates())
         OR ((t.scope_type = 'STAKE') AND app.is_stake_admin(t.scope_id))
         OR ((t.scope_type = 'WARD') AND t.scope_id = app.current_ward_id() AND (app.can_manage_ward_program_templates(t.scope_id) OR app.can_manage_ward_templates_as_stake_admin(t.scope_id)))
         OR ((t.scope_type = 'PERSONAL_DRAFT') AND t.scope_id = app.current_ward_id() AND t.created_by_user_id = app.current_user_id())
         OR ((t.scope_type = 'SYSTEM') AND t.scope_id IS NULL AND t.status = 'PUBLISHED' AND t.current_published_version_id = document_template_version.id)
         OR ((t.scope_type = 'STAKE') AND t.status = 'PUBLISHED' AND t.current_published_version_id = document_template_version.id AND app.has_active_ward_access(app.current_ward_id()) AND EXISTS (SELECT 1 FROM public.ward w WHERE w.id = app.current_ward_id() AND w.stake_id = t.scope_id))
         OR ((t.scope_type = 'WARD') AND t.scope_id = app.current_ward_id() AND t.status = 'PUBLISHED' AND t.current_published_version_id = document_template_version.id AND app.has_active_ward_access(t.scope_id))
       )
  )
);

DROP POLICY IF EXISTS document_template_version_insert ON public.document_template_version;
CREATE POLICY document_template_version_insert ON public.document_template_version FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.document_template t
     WHERE t.id = document_template_version.template_id
       AND t.status = 'DRAFT'
       AND (
         (t.scope_type = 'SYSTEM' AND app.can_administer_system_templates())
         OR (t.scope_type = 'STAKE' AND app.is_stake_admin(t.scope_id))
         OR (t.scope_type = 'WARD' AND (app.can_manage_ward_program_templates(t.scope_id) OR app.can_manage_ward_templates_as_stake_admin(t.scope_id)))
         OR (t.scope_type = 'PERSONAL_DRAFT' AND t.created_by_user_id = app.current_user_id() AND (app.can_manage_ward_program_templates(t.scope_id) OR app.can_manage_ward_templates_as_stake_admin(t.scope_id)))
       )
  )
);

DROP POLICY IF EXISTS document_template_version_update ON public.document_template_version;
CREATE POLICY document_template_version_update ON public.document_template_version FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.document_template t
     WHERE t.id = document_template_version.template_id
       AND (
         (t.status = 'DRAFT' AND ((t.scope_type = 'SYSTEM' AND app.can_administer_system_templates()) OR (t.scope_type = 'STAKE' AND app.is_stake_admin(t.scope_id)) OR (t.scope_type = 'WARD' AND (app.can_manage_ward_program_templates(t.scope_id) OR app.can_manage_ward_templates_as_stake_admin(t.scope_id))) OR (t.scope_type = 'PERSONAL_DRAFT' AND t.created_by_user_id = app.current_user_id() AND (app.can_manage_ward_program_templates(t.scope_id) OR app.can_manage_ward_templates_as_stake_admin(t.scope_id)))))
         OR (t.status = 'PUBLISHED' AND t.current_published_version_id = document_template_version.id AND ((t.scope_type = 'SYSTEM' AND app.can_administer_system_templates()) OR (t.scope_type = 'STAKE' AND app.is_stake_admin(t.scope_id)) OR (t.scope_type = 'WARD' AND (app.can_manage_ward_program_templates(t.scope_id) OR app.can_manage_ward_templates_as_stake_admin(t.scope_id))) OR (t.scope_type = 'PERSONAL_DRAFT' AND t.created_by_user_id = app.current_user_id() AND (app.can_manage_ward_program_templates(t.scope_id) OR app.can_manage_ward_templates_as_stake_admin(t.scope_id)))))
       )
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.document_template t
     WHERE t.id = document_template_version.template_id
       AND (
         (t.status = 'DRAFT' AND ((t.scope_type = 'SYSTEM' AND app.can_administer_system_templates()) OR (t.scope_type = 'STAKE' AND app.is_stake_admin(t.scope_id)) OR (t.scope_type = 'WARD' AND (app.can_manage_ward_program_templates(t.scope_id) OR app.can_manage_ward_templates_as_stake_admin(t.scope_id))) OR (t.scope_type = 'PERSONAL_DRAFT' AND t.created_by_user_id = app.current_user_id() AND (app.can_manage_ward_program_templates(t.scope_id) OR app.can_manage_ward_templates_as_stake_admin(t.scope_id)))))
         OR (t.status = 'PUBLISHED' AND t.current_published_version_id = document_template_version.id AND ((t.scope_type = 'SYSTEM' AND app.can_administer_system_templates()) OR (t.scope_type = 'STAKE' AND app.is_stake_admin(t.scope_id)) OR (t.scope_type = 'WARD' AND (app.can_manage_ward_program_templates(t.scope_id) OR app.can_manage_ward_templates_as_stake_admin(t.scope_id))) OR (t.scope_type = 'PERSONAL_DRAFT' AND t.created_by_user_id = app.current_user_id() AND (app.can_manage_ward_program_templates(t.scope_id) OR app.can_manage_ward_templates_as_stake_admin(t.scope_id)))))
       )
  )
);

DROP POLICY IF EXISTS document_template_version_delete ON public.document_template_version;
CREATE POLICY document_template_version_delete ON public.document_template_version FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.document_template t
     WHERE t.id = document_template_version.template_id
       AND t.status = 'DRAFT'
       AND (
         (t.scope_type = 'SYSTEM' AND app.can_administer_system_templates())
         OR (t.scope_type = 'STAKE' AND app.is_stake_admin(t.scope_id))
         OR (t.scope_type = 'WARD' AND (app.can_manage_ward_program_templates(t.scope_id) OR app.can_manage_ward_templates_as_stake_admin(t.scope_id)))
         OR (t.scope_type = 'PERSONAL_DRAFT' AND t.created_by_user_id = app.current_user_id() AND (app.can_manage_ward_program_templates(t.scope_id) OR app.can_manage_ward_templates_as_stake_admin(t.scope_id)))
       )
  )
);
