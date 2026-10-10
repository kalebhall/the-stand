-- Archived document templates, including their parent rows, are immutable.
-- The archive transition itself remains allowed; all later UPDATE/DELETE attempts fail.

CREATE OR REPLACE FUNCTION app.prevent_archived_template_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app
AS $$
BEGIN
  IF OLD.status = 'ARCHIVED'::text THEN
    RAISE EXCEPTION 'Archived templates are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS prevent_archived_template_mutation ON public.document_template;
CREATE TRIGGER prevent_archived_template_mutation
BEFORE UPDATE OR DELETE ON public.document_template
FOR EACH ROW EXECUTE FUNCTION app.prevent_archived_template_mutation();

DROP POLICY IF EXISTS document_template_update ON public.document_template;
CREATE POLICY document_template_update ON public.document_template FOR UPDATE USING (
  status <> 'ARCHIVED'::text
  AND (
    (scope_type = 'SYSTEM' AND app.can_administer_system_templates())
    OR (scope_type = 'STAKE' AND app.is_stake_admin(scope_id))
    OR (scope_type = 'WARD' AND app.can_manage_ward_program_templates(scope_id))
    OR (scope_type = 'PERSONAL_DRAFT' AND created_by_user_id = app.current_user_id() AND app.can_manage_ward_program_templates(scope_id))
  )
) WITH CHECK (
  (
    (scope_type = 'SYSTEM' AND app.can_administer_system_templates())
    OR (scope_type = 'STAKE' AND app.is_stake_admin(scope_id))
    OR (scope_type = 'WARD' AND app.can_manage_ward_program_templates(scope_id))
    OR (scope_type = 'PERSONAL_DRAFT' AND created_by_user_id = app.current_user_id() AND app.can_manage_ward_program_templates(scope_id))
  )
);

DROP POLICY IF EXISTS document_template_delete ON public.document_template;
CREATE POLICY document_template_delete ON public.document_template FOR DELETE USING (
  status <> 'ARCHIVED'::text
  AND (
    (scope_type = 'SYSTEM' AND app.can_administer_system_templates())
    OR (scope_type = 'STAKE' AND app.is_stake_admin(scope_id))
    OR (scope_type = 'WARD' AND app.can_manage_ward_program_templates(scope_id))
    OR (scope_type = 'PERSONAL_DRAFT' AND created_by_user_id = app.current_user_id() AND app.can_manage_ward_program_templates(scope_id))
  )
);
