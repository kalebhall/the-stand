ALTER TABLE global_notification_delivery
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;

CREATE INDEX IF NOT EXISTS global_notification_delivery_next_attempt_idx
  ON global_notification_delivery (delivery_status, next_attempt_at, created_at);
