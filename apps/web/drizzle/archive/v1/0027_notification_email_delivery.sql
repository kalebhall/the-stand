ALTER TABLE notification_delivery
  ADD COLUMN IF NOT EXISTS recipient_user_id UUID REFERENCES user_account(id) ON DELETE CASCADE;

ALTER TABLE notification_delivery
  DROP CONSTRAINT IF EXISTS notification_delivery_event_channel_unique;

CREATE UNIQUE INDEX IF NOT EXISTS notification_delivery_webhook_unique
  ON notification_delivery (event_outbox_id, channel)
  WHERE channel = 'webhook';

CREATE UNIQUE INDEX IF NOT EXISTS notification_delivery_email_recipient_unique
  ON notification_delivery (event_outbox_id, channel, recipient_user_id)
  WHERE channel = 'EMAIL';

CREATE INDEX IF NOT EXISTS notification_delivery_recipient_idx
  ON notification_delivery (ward_id, recipient_user_id, created_at DESC);
