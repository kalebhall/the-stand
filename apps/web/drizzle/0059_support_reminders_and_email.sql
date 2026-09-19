ALTER TABLE support_work_item
  ADD COLUMN IF NOT EXISTS reminder_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reminded_at TIMESTAMPTZ;

ALTER TABLE global_event_outbox
  DROP CONSTRAINT IF EXISTS global_event_outbox_event_type_check;

ALTER TABLE global_event_outbox
  ADD CONSTRAINT global_event_outbox_event_type_check CHECK (event_type IN (
    'SUPPORT_REQUEST_CREATED',
    'USER_REQUIRES_ASSIGNMENT',
    'SUPPORT_REQUEST_ASSIGNED',
    'SUPPORT_REQUEST_STATUS_CHANGED',
    'SUPPORT_REQUEST_REMINDER'
  ));

CREATE INDEX IF NOT EXISTS support_work_item_reminder_idx
  ON support_work_item (status, last_reminded_at, created_at);
