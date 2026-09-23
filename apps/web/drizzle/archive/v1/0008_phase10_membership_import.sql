CREATE TABLE IF NOT EXISTS member (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES ward(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ward_id, full_name)
);

CREATE TABLE IF NOT EXISTS member_note (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES ward(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL,
  created_by_user_id UUID REFERENCES user_account(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS import_run (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES ward(id) ON DELETE CASCADE,
  import_type TEXT NOT NULL CHECK (import_type IN ('MEMBERSHIP', 'CALLINGS')),
  raw_text TEXT NOT NULL,
  parsed_count INTEGER NOT NULL DEFAULT 0,
  committed BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_user_id UUID REFERENCES user_account(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE member ENABLE ROW LEVEL SECURITY;
ALTER TABLE member FORCE ROW LEVEL SECURITY;
ALTER TABLE member_note ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_note FORCE ROW LEVEL SECURITY;
ALTER TABLE import_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_run FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_isolation ON member;
CREATE POLICY member_isolation ON member
USING (ward_id = app.current_ward_id())
WITH CHECK (ward_id = app.current_ward_id());

DROP POLICY IF EXISTS member_note_isolation ON member_note;
CREATE POLICY member_note_isolation ON member_note
USING (ward_id = app.current_ward_id())
WITH CHECK (ward_id = app.current_ward_id());

DROP POLICY IF EXISTS import_run_isolation ON import_run;
CREATE POLICY import_run_isolation ON import_run
USING (ward_id = app.current_ward_id())
WITH CHECK (ward_id = app.current_ward_id());
