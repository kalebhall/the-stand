ALTER TABLE global_notification_delivery
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

CREATE INDEX IF NOT EXISTS global_notification_delivery_processing_idx
  ON global_notification_delivery (delivery_status, processing_started_at);
