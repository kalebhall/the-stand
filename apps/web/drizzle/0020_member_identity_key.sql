-- Replace persisted birthdays with keyed, non-reversible import identifiers.
ALTER TABLE member ADD COLUMN IF NOT EXISTS identity_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS member_ward_identity_key_unique
  ON member (ward_id, identity_key)
  WHERE identity_key IS NOT NULL;

ALTER TABLE member DROP COLUMN IF EXISTS birthday;
ALTER TABLE calling_assignment DROP COLUMN IF EXISTS birthday;

-- Import history previously contained raw LCR text, including birthdays.
-- Retain run metadata while removing that sensitive payload.
UPDATE import_run SET raw_text = '[redacted: sensitive import payload removed]';