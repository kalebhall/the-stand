CREATE TABLE IF NOT EXISTS event_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES ward(id) ON DELETE CASCADE,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_outbox_dedupe UNIQUE (ward_id, event_type, aggregate_id)
);

CREATE TABLE IF NOT EXISTS notification_delivery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES ward(id) ON DELETE CASCADE,
  event_outbox_id UUID NOT NULL REFERENCES event_outbox(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'success', 'failure')),
  external_id TEXT,
  error_message TEXT,
  attempted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notification_delivery_event_channel_unique UNIQUE (event_outbox_id, channel)
);

ALTER TABLE event_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_outbox FORCE ROW LEVEL SECURITY;
ALTER TABLE notification_delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_delivery FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_outbox_isolation ON event_outbox;
CREATE POLICY event_outbox_isolation ON event_outbox
USING (ward_id = app.current_ward_id())
WITH CHECK (ward_id = app.current_ward_id());

DROP POLICY IF EXISTS notification_delivery_isolation ON notification_delivery;
CREATE POLICY notification_delivery_isolation ON notification_delivery
USING (ward_id = app.current_ward_id())
WITH CHECK (ward_id = app.current_ward_id());
