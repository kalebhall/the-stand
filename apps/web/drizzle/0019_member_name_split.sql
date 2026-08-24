-- Add first_name and last_name columns split from full_name (LCR format: "Last, First Middle").
-- full_name is kept as-is for import matching (unique constraint).
ALTER TABLE member ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE member ADD COLUMN IF NOT EXISTS last_name  text;
