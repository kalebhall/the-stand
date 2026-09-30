CREATE TABLE IF NOT EXISTS public.program_source_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES public.ward(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_version TEXT,
  source_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT program_source_event_identity_unique UNIQUE (ward_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS program_source_event_ward_type_idx
  ON public.program_source_event (ward_id, source_type, updated_at DESC);

ALTER TABLE public.program_source_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_source_event FORCE ROW LEVEL SECURITY;

CREATE POLICY program_source_event_ward_isolation
  ON public.program_source_event
  USING (ward_id = app.current_ward_id() AND app.has_active_ward_access(ward_id))
  WITH CHECK (ward_id = app.current_ward_id() AND app.has_active_ward_access(ward_id));
