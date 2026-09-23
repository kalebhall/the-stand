CREATE TABLE IF NOT EXISTS global_event_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'SUPPORT_REQUEST_CREATED',
    'USER_REQUIRES_ASSIGNMENT',
    'SUPPORT_REQUEST_ASSIGNED',
    'SUPPORT_REQUEST_STATUS_CHANGED'
  )),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'processed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT global_event_outbox_dedupe UNIQUE (event_type, aggregate_id)
);

CREATE INDEX IF NOT EXISTS global_event_outbox_pending_idx
  ON global_event_outbox (status, available_at, created_at);

CREATE TABLE IF NOT EXISTS global_user_notification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id UUID NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  source_event_id UUID NOT NULL REFERENCES global_event_outbox(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  details JSONB,
  severity TEXT NOT NULL DEFAULT 'info',
  target_url TEXT,
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT global_user_notification_recipient_event_unique UNIQUE (recipient_user_id, source_event_id)
);

CREATE INDEX IF NOT EXISTS global_user_notification_recipient_created_idx
  ON global_user_notification (recipient_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS global_notification_delivery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  global_event_outbox_id UUID NOT NULL REFERENCES global_event_outbox(id) ON DELETE CASCADE,
  recipient_user_id UUID REFERENCES user_account(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('IN_APP', 'EMAIL')),
  delivery_status TEXT NOT NULL DEFAULT 'pending',
  external_id TEXT,
  error_message TEXT,
  attempted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT global_notification_delivery_unique UNIQUE (global_event_outbox_id, recipient_user_id, channel)
);

CREATE INDEX IF NOT EXISTS global_notification_delivery_status_idx
  ON global_notification_delivery (delivery_status, updated_at);
