-- Members with identical names but distinct LCR birthdays use distinct identity keys.
-- Remove legacy name uniqueness so both records can be retained.
ALTER TABLE member DROP CONSTRAINT IF EXISTS member_ward_id_full_name_key;
