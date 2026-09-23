CREATE TABLE IF NOT EXISTS scheduled_interview (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES ward(id) ON DELETE CASCADE,
  interview_type TEXT NOT NULL,
  member_name TEXT NOT NULL,
  interviewer_name TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED')),
  linked_action_id UUID REFERENCES meeting_membership_ordinance(id) ON DELETE SET NULL,
  linked_calling_id UUID REFERENCES calling_assignment(id) ON DELETE SET NULL,
  private_note TEXT,
  completed_at TIMESTAMPTZ,
  created_by_user_id UUID NOT NULL REFERENCES user_account(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scheduled_interview_ward_time_idx ON scheduled_interview (ward_id, scheduled_at);
