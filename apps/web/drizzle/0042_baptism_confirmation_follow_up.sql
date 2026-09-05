ALTER TABLE meeting_membership_ordinance
  DROP CONSTRAINT IF EXISTS meeting_membership_ordinance_action_type_check,
  ADD CONSTRAINT meeting_membership_ordinance_action_type_check
    CHECK (action_type IN ('WELCOME_NEW_MEMBER', 'RECOGNIZE_BAPTIZED_CHILD', 'BAPTISM_CONFIRMATION_FOLLOW_UP', 'BABY_BLESSING', 'PRIESTHOOD_ORDINATION', 'PRIESTHOOD_ADVANCEMENT'));

ALTER TABLE meeting_membership_ordinance
  ADD COLUMN IF NOT EXISTS baptism_date DATE,
  ADD COLUMN IF NOT EXISTS confirmation_date DATE,
  ADD COLUMN IF NOT EXISTS baptism_status TEXT,
  ADD COLUMN IF NOT EXISTS confirmation_status TEXT;

ALTER TABLE meeting_membership_ordinance
  DROP CONSTRAINT IF EXISTS meeting_membership_ordinance_baptism_status_check,
  ADD CONSTRAINT meeting_membership_ordinance_baptism_status_check
    CHECK (baptism_status IS NULL OR baptism_status IN ('planned', 'completed', 'cancelled')),
  DROP CONSTRAINT IF EXISTS meeting_membership_ordinance_confirmation_status_check,
  ADD CONSTRAINT meeting_membership_ordinance_confirmation_status_check
    CHECK (confirmation_status IS NULL OR confirmation_status IN ('planned', 'completed', 'cancelled'));
