-- Prevent a persisted template from changing tenant scope or owner identity.
-- Scope is authorization-bearing identity, not editable document metadata.

CREATE OR REPLACE FUNCTION app.prevent_document_template_scope_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app
AS $$
BEGIN
  IF NEW.scope_type IS DISTINCT FROM OLD.scope_type
     OR NEW.scope_id IS DISTINCT FROM OLD.scope_id
     OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id THEN
    RAISE EXCEPTION 'document template scope and owner are immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS document_template_scope_immutable ON public.document_template;
CREATE TRIGGER document_template_scope_immutable
BEFORE UPDATE OF scope_type, scope_id, created_by_user_id ON public.document_template
FOR EACH ROW EXECUTE FUNCTION app.prevent_document_template_scope_mutation();
