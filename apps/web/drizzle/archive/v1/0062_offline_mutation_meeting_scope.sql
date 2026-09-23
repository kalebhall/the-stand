ALTER TABLE offline_mutation
  ADD COLUMN IF NOT EXISTS meeting_id UUID;

CREATE INDEX IF NOT EXISTS offline_mutation_meeting_idx ON offline_mutation (meeting_id, created_at DESC);
