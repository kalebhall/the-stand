ALTER TABLE meeting_business_line
  ADD COLUMN IF NOT EXISTS calling_assignment_id UUID REFERENCES calling_assignment(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS meeting_business_line_follow_up_idx
  ON meeting_business_line (ward_id, calling_assignment_id, action_type, status);

-- Link existing sustain lines to their calling where the stored names still identify
-- one assignment. New lines receive this relationship at creation time.
WITH matches AS (
  SELECT DISTINCT ON (b.id)
         b.id AS line_id,
         ca.id AS calling_assignment_id
    FROM meeting_business_line AS b
    JOIN calling_assignment AS ca
      ON ca.ward_id = b.ward_id
     AND ca.member_name = b.member_name
     AND ca.calling_name = b.calling_name
   WHERE b.action_type = 'SUSTAIN'
     AND b.calling_assignment_id IS NULL
   ORDER BY b.id, ca.created_at DESC
)
UPDATE meeting_business_line AS b
   SET calling_assignment_id = matches.calling_assignment_id
  FROM matches
 WHERE b.id = matches.line_id;

CREATE INDEX IF NOT EXISTS meeting_membership_ordinance_follow_up_idx
  ON meeting_membership_ordinance (ward_id, status, meeting_id, created_at);
