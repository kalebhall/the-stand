-- Add archived_at to member table.
-- NULL = active member.  Non-NULL = archived (moved out of ward, etc.)
ALTER TABLE member ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
