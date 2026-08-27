CREATE TABLE IF NOT EXISTS internal_note (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES ward(id) ON DELETE CASCADE,
  member_id UUID REFERENCES member(id) ON DELETE CASCADE,
  meeting_id UUID REFERENCES meeting(id) ON DELETE CASCADE,
  program_item_id UUID REFERENCES meeting_program_item(id) ON DELETE CASCADE,
  visibility TEXT NOT NULL CHECK (visibility IN ('LEADERSHIP', 'PRIVATE')),
  note_text TEXT NOT NULL CHECK (length(btrim(note_text)) > 0),
  created_by_user_id UUID NOT NULL REFERENCES user_account(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT internal_note_exactly_one_target CHECK (
    (CASE WHEN member_id IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN meeting_id IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN program_item_id IS NULL THEN 0 ELSE 1 END) = 1
  )
);

CREATE INDEX IF NOT EXISTS internal_note_ward_created_idx ON internal_note (ward_id, created_at DESC);
CREATE INDEX IF NOT EXISTS internal_note_member_idx ON internal_note (member_id, created_at DESC) WHERE member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS internal_note_meeting_idx ON internal_note (meeting_id, created_at DESC) WHERE meeting_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS internal_note_program_item_idx ON internal_note (program_item_id, created_at DESC) WHERE program_item_id IS NOT NULL;

INSERT INTO internal_note (ward_id, member_id, visibility, note_text, created_by_user_id, created_at, updated_at)
SELECT mn.ward_id, mn.member_id, 'LEADERSHIP', mn.note_text, mn.created_by_user_id, mn.created_at, mn.created_at
  FROM member_note mn
 WHERE mn.created_by_user_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1
       FROM internal_note note
      WHERE note.ward_id = mn.ward_id
        AND note.member_id = mn.member_id
        AND note.note_text = mn.note_text
        AND note.created_at = mn.created_at
   );

ALTER TABLE internal_note ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_note FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS internal_note_isolation ON internal_note;
CREATE POLICY internal_note_isolation ON internal_note
USING (ward_id = app.current_ward_id())
WITH CHECK (ward_id = app.current_ward_id());
