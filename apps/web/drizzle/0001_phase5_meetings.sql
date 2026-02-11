CREATE TABLE IF NOT EXISTS meeting (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES ward(id) ON DELETE CASCADE,
  meeting_date DATE NOT NULL,
  meeting_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meeting_program_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES ward(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES meeting(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  item_type TEXT NOT NULL,
  title TEXT,
  notes TEXT,
  hymn_number TEXT,
  hymn_title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meeting_program_render (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES ward(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES meeting(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  render_html TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, version)
);

ALTER TABLE meeting ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting FORCE ROW LEVEL SECURITY;
ALTER TABLE meeting_program_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_program_item FORCE ROW LEVEL SECURITY;
ALTER TABLE meeting_program_render ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_program_render FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meeting_isolation ON meeting;
CREATE POLICY meeting_isolation ON meeting
USING (ward_id = app.current_ward_id())
WITH CHECK (ward_id = app.current_ward_id());

DROP POLICY IF EXISTS meeting_program_item_isolation ON meeting_program_item;
CREATE POLICY meeting_program_item_isolation ON meeting_program_item
USING (ward_id = app.current_ward_id())
WITH CHECK (ward_id = app.current_ward_id());

DROP POLICY IF EXISTS meeting_program_render_isolation ON meeting_program_render;
CREATE POLICY meeting_program_render_isolation ON meeting_program_render
USING (ward_id = app.current_ward_id())
WITH CHECK (ward_id = app.current_ward_id());
