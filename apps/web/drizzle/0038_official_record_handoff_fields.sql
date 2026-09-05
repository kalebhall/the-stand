ALTER TABLE meeting_membership_ordinance
  ADD COLUMN IF NOT EXISTS record_form_needed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS handoff_date DATE,
  ADD COLUMN IF NOT EXISTS official_record_updated_by TEXT,
  ADD COLUMN IF NOT EXISTS certificate_or_form_delivered BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS official_system_follow_up_status TEXT NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS official_system_reference_url TEXT;

ALTER TABLE meeting_membership_ordinance
  DROP CONSTRAINT IF EXISTS meeting_membership_ordinance_official_system_follow_up_status_check,
  ADD CONSTRAINT meeting_membership_ordinance_official_system_follow_up_status_check
    CHECK (official_system_follow_up_status IN ('not_started', 'in_progress', 'completed', 'not_applicable'));

UPDATE meeting_membership_ordinance
   SET record_form_needed = TRUE
 WHERE action_type IN ('WELCOME_NEW_MEMBER', 'PRIESTHOOD_ORDINATION', 'PRIESTHOOD_ADVANCEMENT');
