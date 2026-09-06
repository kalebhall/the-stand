ALTER TABLE bishopric_meeting
  ADD COLUMN IF NOT EXISTS meeting_type TEXT NOT NULL DEFAULT 'BISHOPRIC';

ALTER TABLE bishopric_meeting
  DROP CONSTRAINT IF EXISTS bishopric_meeting_meeting_type_check,
  ADD CONSTRAINT bishopric_meeting_meeting_type_check
    CHECK (meeting_type IN ('BISHOPRIC', 'WARD_COUNCIL', 'MISSIONARY_COORDINATION'));

CREATE INDEX IF NOT EXISTS bishopric_meeting_ward_type_date_idx ON bishopric_meeting (ward_id, meeting_type, meeting_date DESC);
