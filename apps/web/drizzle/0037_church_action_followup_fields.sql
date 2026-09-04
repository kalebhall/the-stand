ALTER TABLE meeting_membership_ordinance
  ADD COLUMN IF NOT EXISTS planned_date DATE,
  ADD COLUMN IF NOT EXISTS interview_status TEXT NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS interview_date DATE,
  ADD COLUMN IF NOT EXISTS interviewer_name TEXT,
  ADD COLUMN IF NOT EXISTS responsible_leader TEXT,
  ADD COLUMN IF NOT EXISTS lcr_follow_up_status TEXT NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS lcr_updated_at TIMESTAMPTZ;

ALTER TABLE meeting_membership_ordinance
  DROP CONSTRAINT IF EXISTS meeting_membership_ordinance_interview_status_check,
  ADD CONSTRAINT meeting_membership_ordinance_interview_status_check
    CHECK (interview_status IN ('not_required', 'needed', 'scheduled', 'completed')),
  DROP CONSTRAINT IF EXISTS meeting_membership_ordinance_lcr_follow_up_status_check,
  ADD CONSTRAINT meeting_membership_ordinance_lcr_follow_up_status_check
    CHECK (lcr_follow_up_status IN ('not_applicable', 'needed', 'completed'));