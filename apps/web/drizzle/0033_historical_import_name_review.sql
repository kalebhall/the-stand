CREATE TABLE IF NOT EXISTS historical_import_name_review (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES ward(id) ON DELETE CASCADE,
  source_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  first_seen_date DATE NOT NULL,
  last_seen_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED', 'IGNORED')),
  matched_member_id UUID REFERENCES member(id) ON DELETE SET NULL,
  resolved_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ward_id, source_name)
);

ALTER TABLE historical_import_name_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE historical_import_name_review FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS historical_import_name_review_isolation ON historical_import_name_review;
CREATE POLICY historical_import_name_review_isolation ON historical_import_name_review
USING (ward_id = app.current_ward_id())
WITH CHECK (ward_id = app.current_ward_id());

CREATE INDEX IF NOT EXISTS historical_import_name_review_open_idx
  ON historical_import_name_review (ward_id, status, source_name);
