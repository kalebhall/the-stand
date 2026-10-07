ALTER TABLE global_notification_delivery
  ADD COLUMN IF NOT EXISTS lease_token uuid;

CREATE INDEX IF NOT EXISTS global_notification_delivery_lease_idx
  ON global_notification_delivery (delivery_status, processing_started_at, lease_token);
