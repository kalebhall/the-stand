CREATE TABLE IF NOT EXISTS public.program_publication (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES public.ward(id) ON DELETE CASCADE,
  program_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  token TEXT NOT NULL UNIQUE,
  render_html TEXT NOT NULL,
  document_json JSONB NOT NULL CHECK (jsonb_typeof(document_json) = 'object'),
  published_by_user_id UUID REFERENCES public.user_account(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  publication_metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(publication_metadata_json) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ward_id, program_type, source_type, source_id, version),
  UNIQUE (id, ward_id, program_type, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS program_publication_active_source_idx
  ON public.program_publication (ward_id, program_type, source_type, source_id, version DESC)
  WHERE active = TRUE;

CREATE TABLE IF NOT EXISTS public.program_publication_pointer (
  ward_id UUID NOT NULL REFERENCES public.ward(id) ON DELETE CASCADE,
  program_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  publication_id UUID NOT NULL,
  token TEXT NOT NULL UNIQUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ward_id, program_type, source_type, source_id),
  FOREIGN KEY (publication_id, ward_id, program_type, source_type, source_id)
    REFERENCES public.program_publication(id, ward_id, program_type, source_type, source_id) ON DELETE RESTRICT
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

ALTER TABLE public.program_publication ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_publication FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS program_publication_ward_or_token_isolation ON public.program_publication;
CREATE POLICY program_publication_ward_or_token_isolation
  ON public.program_publication
  USING (
    (ward_id = app.current_ward_id() AND app.has_active_ward_access(ward_id))
    OR (
      active = TRUE
      AND token = current_setting('app.public_program_token', true)
      AND (expires_at IS NULL OR expires_at > now())
    )
  )
  WITH CHECK (ward_id = app.current_ward_id() AND app.has_active_ward_access(ward_id));

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
