CREATE TABLE IF NOT EXISTS public.program_publication_pointer (
  ward_id UUID NOT NULL REFERENCES public.ward(id) ON DELETE CASCADE,
  program_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  publication_id UUID NOT NULL REFERENCES public.program_publication(id) ON DELETE RESTRICT,
  token TEXT NOT NULL UNIQUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ward_id, program_type, source_type, source_id)
);

ALTER TABLE public.program_publication_pointer ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_publication_pointer FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS program_publication_pointer_isolation ON public.program_publication_pointer;
CREATE POLICY program_publication_pointer_isolation
  ON public.program_publication_pointer
  USING (
    (ward_id = app.current_ward_id() AND app.has_active_ward_access(ward_id))
    OR (token = current_setting('app.public_program_token', true))
  )
  WITH CHECK (ward_id = app.current_ward_id() AND app.has_active_ward_access(ward_id));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'program_publication_identity_unique') THEN
    ALTER TABLE public.program_publication
      ADD CONSTRAINT program_publication_identity_unique UNIQUE (id, ward_id, program_type, source_type, source_id);
  END IF;
  ALTER TABLE public.program_publication_pointer
    DROP CONSTRAINT IF EXISTS program_publication_pointer_publication_id_fkey;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'program_publication_pointer_identity_fkey') THEN
    ALTER TABLE public.program_publication_pointer
      ADD CONSTRAINT program_publication_pointer_identity_fkey
      FOREIGN KEY (publication_id, ward_id, program_type, source_type, source_id)
      REFERENCES public.program_publication(id, ward_id, program_type, source_type, source_id)
      ON DELETE RESTRICT;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.prevent_program_publication_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'program publication history is immutable' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS program_publication_immutable ON public.program_publication;
CREATE TRIGGER program_publication_immutable
  BEFORE UPDATE OR DELETE ON public.program_publication
  FOR EACH ROW EXECUTE FUNCTION public.prevent_program_publication_mutation();
