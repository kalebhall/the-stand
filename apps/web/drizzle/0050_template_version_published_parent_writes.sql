-- Published templates are immutable version collections. Only a draft parent may
-- receive, change, or delete versions. The sole published-parent UPDATE exception
-- is the trigger-maintained publication marker on the current pointer row; the
-- version trigger rejects all other field changes.

DROP POLICY IF EXISTS document_template_version_insert ON public.document_template_version;
CREATE POLICY document_template_version_insert ON public.document_template_version FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.document_template t
     WHERE t.id = document_template_version.template_id
       AND t.status = 'DRAFT'::text
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
       AND (
         (t.status = 'DRAFT'::text AND (
           (t.scope_type = 'SYSTEM' AND app.can_administer_system_templates())
           OR (t.scope_type = 'STAKE' AND app.is_stake_admin(t.scope_id))
           OR (t.scope_type = 'WARD' AND app.can_manage_ward_program_templates(t.scope_id))
           OR (t.scope_type = 'PERSONAL_DRAFT' AND t.created_by_user_id = app.current_user_id() AND app.can_manage_ward_program_templates(t.scope_id))
         ))
         OR (t.status = 'PUBLISHED'::text AND t.current_published_version_id = document_template_version.id AND (
           (t.scope_type = 'SYSTEM' AND app.can_administer_system_templates())
           OR (t.scope_type = 'STAKE' AND app.is_stake_admin(t.scope_id))
           OR (t.scope_type = 'WARD' AND app.can_manage_ward_program_templates(t.scope_id))
           OR (t.scope_type = 'PERSONAL_DRAFT' AND t.created_by_user_id = app.current_user_id() AND app.can_manage_ward_program_templates(t.scope_id))
         ))
       )
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.document_template t
     WHERE t.id = document_template_version.template_id
       AND (
         (t.status = 'DRAFT'::text AND (
           (t.scope_type = 'SYSTEM' AND app.can_administer_system_templates())
           OR (t.scope_type = 'STAKE' AND app.is_stake_admin(t.scope_id))
           OR (t.scope_type = 'WARD' AND app.can_manage_ward_program_templates(t.scope_id))
           OR (t.scope_type = 'PERSONAL_DRAFT' AND t.created_by_user_id = app.current_user_id() AND app.can_manage_ward_program_templates(t.scope_id))
         ))
         OR (t.status = 'PUBLISHED'::text AND t.current_published_version_id = document_template_version.id AND (
           (t.scope_type = 'SYSTEM' AND app.can_administer_system_templates())
           OR (t.scope_type = 'STAKE' AND app.is_stake_admin(t.scope_id))
           OR (t.scope_type = 'WARD' AND app.can_manage_ward_program_templates(t.scope_id))
           OR (t.scope_type = 'PERSONAL_DRAFT' AND t.created_by_user_id = app.current_user_id() AND app.can_manage_ward_program_templates(t.scope_id))
         ))
       )
  )
);

DROP POLICY IF EXISTS document_template_version_delete ON public.document_template_version;
CREATE POLICY document_template_version_delete ON public.document_template_version FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.document_template t
     WHERE t.id = document_template_version.template_id
       AND t.status = 'DRAFT'::text
       AND (
         (t.scope_type = 'SYSTEM' AND app.can_administer_system_templates())
         OR (t.scope_type = 'STAKE' AND app.is_stake_admin(t.scope_id))
         OR (t.scope_type = 'WARD' AND app.can_manage_ward_program_templates(t.scope_id))
         OR (t.scope_type = 'PERSONAL_DRAFT' AND t.created_by_user_id = app.current_user_id() AND app.can_manage_ward_program_templates(t.scope_id))
       )
  )
);
