ALTER TABLE meeting_membership_ordinance
  DROP CONSTRAINT IF EXISTS meeting_membership_ordinance_action_type_check,
  ADD CONSTRAINT meeting_membership_ordinance_action_type_check
    CHECK (action_type IN ('WELCOME_NEW_MEMBER', 'RECOGNIZE_BAPTIZED_CHILD', 'BAPTISM_CONFIRMATION_FOLLOW_UP', 'ATTENDANCE_LCR_HANDOFF', 'BABY_BLESSING', 'PRIESTHOOD_ORDINATION', 'PRIESTHOOD_ADVANCEMENT'));
