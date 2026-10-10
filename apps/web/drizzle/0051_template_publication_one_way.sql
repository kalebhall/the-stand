-- Publication is a one-way lifecycle transition. A published template may be
-- republished or archived, but it must never return to DRAFT, which would reopen
-- historical version writes.

CREATE OR REPLACE FUNCTION app.prevent_template_publication_regression()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app
AS $$
BEGIN
  IF OLD.status = 'PUBLISHED'::text AND NEW.status = 'DRAFT'::text THEN
    RAISE EXCEPTION 'Published templates cannot return to draft';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_template_publication_regression ON public.document_template;
CREATE TRIGGER prevent_template_publication_regression
BEFORE UPDATE OF status ON public.document_template
FOR EACH ROW EXECUTE FUNCTION app.prevent_template_publication_regression();
