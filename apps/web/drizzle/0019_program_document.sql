CREATE TABLE IF NOT EXISTS public.program_document (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES public.ward(id) ON DELETE CASCADE,
  program_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_version TEXT,
  schema_version INTEGER NOT NULL,
  document_json JSONB NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_by_user_id UUID REFERENCES public.user_account(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT program_document_revision_positive CHECK (revision > 0),
  CONSTRAINT program_document_schema_version_positive CHECK (schema_version > 0),
  CONSTRAINT program_document_source_identity_unique UNIQUE (ward_id, program_type, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS program_document_ward_type_idx
  ON public.program_document (ward_id, program_type, source_type, updated_at DESC);

ALTER TABLE public.program_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_document FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS program_document_ward_isolation ON public.program_document;
CREATE POLICY program_document_ward_isolation
  ON public.program_document
  USING (ward_id = app.current_ward_id())
  WITH CHECK (ward_id = app.current_ward_id());
