CREATE UNIQUE INDEX IF NOT EXISTS event_outbox_core_event_dedupe
  ON event_outbox (ward_id, event_type, aggregate_id)
  WHERE aggregate_type = 'core_event';
