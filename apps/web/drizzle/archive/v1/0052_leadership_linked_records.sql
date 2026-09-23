ALTER TABLE bishopric_action
  ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES member(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS calling_assignment_id UUID REFERENCES calling_assignment(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_membership_action_id UUID REFERENCES meeting_membership_ordinance(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bishopric_action_ward_member_idx
  ON bishopric_action (ward_id, member_id);
CREATE INDEX IF NOT EXISTS bishopric_action_ward_calling_idx
  ON bishopric_action (ward_id, calling_assignment_id);
CREATE INDEX IF NOT EXISTS bishopric_action_ward_membership_action_idx
  ON bishopric_action (ward_id, linked_membership_action_id);
