ALTER TABLE notification_delivery
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;

ALTER TABLE notification_delivery
  DROP CONSTRAINT IF EXISTS notification_delivery_delivery_status_check;

UPDATE notification_delivery
   SET delivery_status = 'failed'
 WHERE delivery_status = 'failure';

ALTER TABLE notification_delivery
  ADD CONSTRAINT notification_delivery_delivery_status_check
  CHECK (delivery_status = ANY (ARRAY['pending'::text, 'processing'::text, 'success'::text, 'failed'::text]));

CREATE INDEX IF NOT EXISTS notification_delivery_claim_idx
  ON notification_delivery (delivery_status, next_attempt_at, created_at);

CREATE INDEX IF NOT EXISTS notification_delivery_lease_idx
  ON notification_delivery (delivery_status, processing_started_at, lease_token);

ALTER TABLE notification_delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_delivery FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_delivery_isolation ON notification_delivery;
CREATE POLICY notification_delivery_isolation
  ON notification_delivery
  USING (
    ward_id = app.current_ward_id()
    AND (
      app.current_user_id() = '00000000-0000-0000-0000-000000000000'::uuid
      OR recipient_user_id = app.current_user_id()
    )
  )
  WITH CHECK (
    ward_id = app.current_ward_id()
    AND (
      app.current_user_id() = '00000000-0000-0000-0000-000000000000'::uuid
      OR recipient_user_id = app.current_user_id()
    )
  );
