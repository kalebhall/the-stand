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

CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

CREATE TABLE IF NOT EXISTS user_notification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES ward(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  source_event_id UUID NOT NULL REFERENCES event_outbox(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  details JSONB,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'success', 'warning', 'error')),
  target_url TEXT,
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_notification_recipient_event_unique UNIQUE (recipient_user_id, source_event_id)
);

CREATE INDEX IF NOT EXISTS user_notification_recipient_ward_created_idx
  ON user_notification (recipient_user_id, ward_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_notification_recipient_ward_read_idx
  ON user_notification (recipient_user_id, ward_id, read_at);

ALTER TABLE user_notification ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notification FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_notification_isolation ON user_notification;
CREATE POLICY user_notification_isolation ON user_notification
USING (ward_id = app.current_ward_id() AND recipient_user_id = app.current_user_id())
WITH CHECK (ward_id = app.current_ward_id() AND recipient_user_id = app.current_user_id());