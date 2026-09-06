ALTER TABLE meeting_membership_ordinance
  DROP CONSTRAINT IF EXISTS meeting_membership_ordinance_action_type_check,
  ADD CONSTRAINT meeting_membership_ordinance_action_type_check
    CHECK (action_type IN ('WELCOME_NEW_MEMBER', 'RECOGNIZE_BAPTIZED_CHILD', 'BABY_BLESSING', 'PRIESTHOOD_ORDINATION', 'PRIESTHOOD_ADVANCEMENT'));

ALTER TABLE ward_stand_template
  ADD COLUMN IF NOT EXISTS recognize_baptized_child_template TEXT NOT NULL DEFAULT 'We recognize **{memberName}**, who has been baptized. [Use the ward-approved introduction and welcome; this prompt does not replace the baptism or confirmation ordinance.]';