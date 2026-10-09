-- Restrict global template-administrator RLS reads to SYSTEM rows only.
-- Global support/system administration is intentionally no-ward, but must never
-- become an unscoped read path for ward, stake, or personal-draft templates.
DROP POLICY IF EXISTS document_template_read ON public.document_template;
CREATE POLICY document_template_read ON public.document_template FOR SELECT USING (
  ((scope_type = 'SYSTEM'::text) AND (status = 'PUBLISHED'::text))
  OR ((scope_type = 'SYSTEM'::text) AND (scope_id IS NULL) AND app.can_administer_system_templates())
  OR ((scope_type = 'STAKE'::text) AND (app.is_stake_admin(scope_id) OR ((status = 'PUBLISHED'::text) AND (EXISTS (
    SELECT 1 FROM public.ward w
    WHERE w.id = app.current_ward_id() AND w.stake_id = document_template.scope_id
  )))))
  OR ((scope_type = 'WARD'::text) AND (scope_id = app.current_ward_id()))
  OR ((scope_type = 'PERSONAL_DRAFT'::text) AND (scope_id = app.current_ward_id()) AND (created_by_user_id = app.current_user_id()))
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
        OR ((t.scope_type = 'STAKE'::text) AND (app.is_stake_admin(t.scope_id) OR ((t.status = 'PUBLISHED'::text) AND (EXISTS (
          SELECT 1 FROM public.ward w
          WHERE w.id = app.current_ward_id() AND w.stake_id = t.scope_id
        )))))
        OR ((t.scope_type = 'WARD'::text) AND (t.scope_id = app.current_ward_id()))
        OR ((t.scope_type = 'PERSONAL_DRAFT'::text) AND (t.scope_id = app.current_ward_id()) AND (t.created_by_user_id = app.current_user_id()))
      )
  )
);
