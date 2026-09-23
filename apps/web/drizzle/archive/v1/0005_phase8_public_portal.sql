CREATE OR REPLACE FUNCTION app.current_public_meeting_token()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.public_meeting_token', true), '')
$$;

CREATE OR REPLACE FUNCTION app.current_public_portal_token()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.public_portal_token', true), '')
$$;

CREATE TABLE IF NOT EXISTS public_program_share (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES ward(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES meeting(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT public_program_share_meeting_unique UNIQUE (meeting_id)
);

CREATE TABLE IF NOT EXISTS public_program_portal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES ward(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT public_program_portal_ward_unique UNIQUE (ward_id)
);

ALTER TABLE public_program_share ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_program_share FORCE ROW LEVEL SECURITY;
ALTER TABLE public_program_portal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_program_portal FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_program_share_isolation ON public_program_share;
CREATE POLICY public_program_share_isolation ON public_program_share
USING (
  ward_id = app.current_ward_id()
  OR token = app.current_public_meeting_token()
)
WITH CHECK (ward_id = app.current_ward_id());

DROP POLICY IF EXISTS public_program_portal_isolation ON public_program_portal;
CREATE POLICY public_program_portal_isolation ON public_program_portal
USING (
  ward_id = app.current_ward_id()
  OR token = app.current_public_portal_token()
)
WITH CHECK (ward_id = app.current_ward_id());

DROP POLICY IF EXISTS meeting_public_token_read ON meeting;
CREATE POLICY meeting_public_token_read ON meeting
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public_program_share pps
    WHERE pps.meeting_id = meeting.id
      AND pps.token = app.current_public_meeting_token()
  )
);

DROP POLICY IF EXISTS meeting_program_render_public_token_read ON meeting_program_render;
CREATE POLICY meeting_program_render_public_token_read ON meeting_program_render
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public_program_share pps
    WHERE pps.meeting_id = meeting_program_render.meeting_id
      AND pps.token = app.current_public_meeting_token()
  )
);
