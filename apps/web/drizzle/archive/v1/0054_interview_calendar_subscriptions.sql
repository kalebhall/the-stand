CREATE TABLE IF NOT EXISTS interview_calendar_subscription (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES ward(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_by_user_id UUID NOT NULL REFERENCES user_account(id) ON DELETE RESTRICT,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE interview_calendar_subscription ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_calendar_subscription FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS interview_calendar_subscription_isolation ON interview_calendar_subscription;
CREATE POLICY interview_calendar_subscription_isolation ON interview_calendar_subscription
  USING (
    ward_id = app.current_ward_id()
    OR token_hash = NULLIF(current_setting('app.interview_calendar_token_hash', true), '')
  )
  WITH CHECK (ward_id = app.current_ward_id());

CREATE INDEX IF NOT EXISTS interview_calendar_subscription_ward_idx
  ON interview_calendar_subscription (ward_id)
  WHERE revoked_at IS NULL;
