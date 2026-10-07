ALTER TABLE global_event_outbox DROP CONSTRAINT IF EXISTS global_event_outbox_dedupe;

CREATE INDEX IF NOT EXISTS global_event_outbox_aggregate_idx
  ON global_event_outbox (event_type, aggregate_id, created_at);
