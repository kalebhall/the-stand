CREATE TABLE IF NOT EXISTS notification_subscription (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES ward(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  event_type TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('IN_APP', 'EMAIL')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notification_subscription_ward_user_event_channel_unique
    UNIQUE (ward_id, user_id, event_type, channel)
);

CREATE INDEX IF NOT EXISTS notification_subscription_ward_user_idx
  ON notification_subscription (ward_id, user_id);

ALTER TABLE notification_subscription ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_subscription FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_subscription_isolation ON notification_subscription;
CREATE POLICY notification_subscription_isolation ON notification_subscription
USING (ward_id = app.current_ward_id())
WITH CHECK (ward_id = app.current_ward_id());