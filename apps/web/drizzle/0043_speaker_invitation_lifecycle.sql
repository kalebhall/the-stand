ALTER TABLE meeting_program_item
  ADD COLUMN IF NOT EXISTS speaker_status TEXT;

ALTER TABLE meeting_program_item
  DROP CONSTRAINT IF EXISTS meeting_program_item_speaker_status_check,
  ADD CONSTRAINT meeting_program_item_speaker_status_check
    CHECK (speaker_status IS NULL OR speaker_status IN ('PLANNED', 'INVITED', 'ACCEPTED', 'CONFIRMED', 'COMPLETED'));

UPDATE meeting_program_item
   SET speaker_status = 'PLANNED'
 WHERE item_type = 'SPEAKER'
   AND speaker_status IS NULL;
