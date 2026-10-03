-- Preserve immutable template version history after a template is archived.
CREATE OR REPLACE FUNCTION app.prevent_published_template_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.document_template t
     WHERE t.id IN (OLD.template_id, NEW.template_id)
       AND t.status IN ('PUBLISHED', 'ARCHIVED')
  ) THEN
    RAISE EXCEPTION 'Published or archived template versions are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
