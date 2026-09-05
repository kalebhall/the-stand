ALTER TABLE meeting_membership_ordinance
  ADD COLUMN IF NOT EXISTS priesthood_office TEXT,
  ADD COLUMN IF NOT EXISTS approval_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS presenting_leader TEXT,
  ADD COLUMN IF NOT EXISTS performing_priesthood_holder TEXT,
  ADD COLUMN IF NOT EXISTS ordinance_date DATE;

ALTER TABLE meeting_membership_ordinance
  DROP CONSTRAINT IF EXISTS meeting_membership_ordinance_priesthood_office_check,
  ADD CONSTRAINT meeting_membership_ordinance_priesthood_office_check
    CHECK (priesthood_office IS NULL OR priesthood_office IN ('DEACON', 'TEACHER', 'PRIEST', 'ELDER', 'HIGH_PRIEST', 'UNKNOWN'));

UPDATE meeting_membership_ordinance
   SET priesthood_office = CASE
     WHEN upper(trim(details)) IN ('DEACON', 'TEACHER', 'PRIEST', 'ELDER', 'HIGH PRIEST', 'HIGH_PRIEST')
       THEN replace(upper(trim(details)), ' ', '_')
     ELSE NULL
   END
 WHERE action_type IN ('PRIESTHOOD_ORDINATION', 'PRIESTHOOD_ADVANCEMENT')
   AND priesthood_office IS NULL;