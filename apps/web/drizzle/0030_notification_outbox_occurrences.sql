ALTER TABLE event_outbox DROP CONSTRAINT IF EXISTS event_outbox_dedupe;

CREATE UNIQUE INDEX IF NOT EXISTS event_outbox_core_event_dedupe
  ON event_outbox (ward_id, event_type, aggregate_id)
  WHERE aggregate_type = 'core_event';

CREATE UNIQUE INDEX IF NOT EXISTS event_outbox_follow_up_reminder_dedupe
  ON event_outbox (ward_id, event_type, aggregate_id)
  WHERE aggregate_type = 'church_action_follow_up';

CREATE UNIQUE INDEX IF NOT EXISTS event_outbox_technology_reminder_dedupe
  ON event_outbox (ward_id, event_type, aggregate_id)
  WHERE event_type = 'MEETING_TECHNOLOGY_REMINDER';

CREATE UNIQUE INDEX IF NOT EXISTS event_outbox_interview_reminder_dedupe
  ON event_outbox (ward_id, event_type, aggregate_id)
  WHERE event_type = 'INTERVIEW_REMINDER';

CREATE INDEX IF NOT EXISTS event_outbox_aggregate_idx
  ON event_outbox (ward_id, aggregate_type, aggregate_id, created_at);
