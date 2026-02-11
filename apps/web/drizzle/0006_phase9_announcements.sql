CREATE TABLE IF NOT EXISTS announcement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES ward(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  start_date DATE,
  end_date DATE,
  is_permanent BOOLEAN NOT NULL DEFAULT FALSE,
  placement TEXT NOT NULL DEFAULT 'PROGRAM_TOP' CHECK (placement IN ('PROGRAM_TOP', 'PROGRAM_BOTTOM')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE announcement ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS announcement_isolation ON announcement;
CREATE POLICY announcement_isolation ON announcement
USING (ward_id = app.current_ward_id())
WITH CHECK (ward_id = app.current_ward_id());
