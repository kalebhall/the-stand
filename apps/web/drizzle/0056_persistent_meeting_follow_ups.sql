ALTER TABLE meeting_business_line
  ADD COLUMN IF NOT EXISTS calling_assignment_id UUID REFERENCES calling_assignment(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS meeting_business_line_follow_up_idx
  ON meeting_business_line (ward_id, calling_assignment_id, action_type, status);

-- Link existing sustain lines to their calling where the stored names still identify
-- one assignment. New lines receive this relationship at creation time.
UPDATE meeting_business_line b
   SET calling_assignment_id = matches.id
  FROM LATERAL (
    SELECT ca.id
      FROM calling_assignment ca
     WHERE ca.ward_id = b.ward_id
       AND ca.member_name = b.member_name
       AND ca.calling_name = b.calling_name
     ORDER BY ca.created_at DESC
     LIMIT 1
  ) matches
 WHERE b.action_type = 'SUSTAIN'
   AND b.calling_assignment_id IS NULL;

CREATE INDEX IF NOT EXISTS meeting_membership_ordinance_follow_up_idx
  ON meeting_membership_ordinance (ward_id, status, meeting_id, created_at);
