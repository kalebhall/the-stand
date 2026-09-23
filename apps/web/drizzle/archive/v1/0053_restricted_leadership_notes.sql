ALTER TABLE internal_note
  ADD COLUMN IF NOT EXISTS bishopric_action_id UUID REFERENCES bishopric_action(id) ON DELETE CASCADE;

ALTER TABLE internal_note DROP CONSTRAINT IF EXISTS internal_note_exactly_one_target;
ALTER TABLE internal_note ADD CONSTRAINT internal_note_exactly_one_target CHECK (
  ((member_id IS NOT NULL)::int + (meeting_id IS NOT NULL)::int + (program_item_id IS NOT NULL)::int + (bishopric_action_id IS NOT NULL)::int) = 1
);

CREATE INDEX IF NOT EXISTS internal_note_bishopric_action_idx
  ON internal_note (bishopric_action_id, created_at DESC)
  WHERE bishopric_action_id IS NOT NULL;
