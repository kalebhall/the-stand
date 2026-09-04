ALTER TABLE meeting_program_item
  ADD COLUMN IF NOT EXISTS introduction_roles JSONB;