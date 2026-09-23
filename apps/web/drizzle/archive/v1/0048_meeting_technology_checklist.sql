CREATE TABLE IF NOT EXISTS meeting_technology_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES ward(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES meeting(id) ON DELETE CASCADE,
  owner_name TEXT,
  room_ready BOOLEAN NOT NULL DEFAULT false,
  audio_ready BOOLEAN NOT NULL DEFAULT false,
  stream_ready BOOLEAN NOT NULL DEFAULT false,
  accessibility_checked BOOLEAN NOT NULL DEFAULT false,
  authorized_link TEXT,
  start_confirmed_at TIMESTAMPTZ,
  stop_confirmed_at TIMESTAMPTZ,
  recording_deletion_reminder BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ward_id, meeting_id)
);
CREATE INDEX IF NOT EXISTS meeting_technology_checklist_ward_idx ON meeting_technology_checklist (ward_id, updated_at DESC);
