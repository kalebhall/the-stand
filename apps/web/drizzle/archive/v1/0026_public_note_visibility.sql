ALTER TABLE internal_note DROP CONSTRAINT IF EXISTS internal_note_visibility_check;
ALTER TABLE internal_note ADD CONSTRAINT internal_note_visibility_check CHECK (visibility IN ('PUBLIC', 'LEADERSHIP', 'PRIVATE'));

-- Move legacy public item notes into unified notes while retaining program_notes
-- for published-render compatibility during this migration.
INSERT INTO internal_note (ward_id, program_item_id, visibility, note_text, created_by_user_id, created_at, updated_at)
SELECT item.ward_id,
       item.id,
       'PUBLIC',
       item.program_notes,
       ward_user.user_id,
       now(),
       now()
  FROM meeting_program_item item
  JOIN LATERAL (
    SELECT wur.user_id
      FROM ward_user_role wur
     WHERE wur.ward_id = item.ward_id
       AND wur.revoked_at IS NULL
     ORDER BY wur.created_at ASC
     LIMIT 1
  ) ward_user ON TRUE
 WHERE item.program_notes IS NOT NULL
   AND length(btrim(item.program_notes)) > 0
   AND NOT EXISTS (
     SELECT 1
       FROM internal_note note
      WHERE note.program_item_id = item.id
        AND note.visibility = 'PUBLIC'
   );

CREATE UNIQUE INDEX IF NOT EXISTS internal_note_public_program_item_unique
  ON internal_note (program_item_id)
  WHERE visibility = 'PUBLIC' AND program_item_id IS NOT NULL;
