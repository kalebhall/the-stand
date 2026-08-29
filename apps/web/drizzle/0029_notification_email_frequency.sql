CREATE TABLE IF NOT EXISTS notification_email_preference (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES ward(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  frequency TEXT NOT NULL DEFAULT 'IMMEDIATE' CHECK (frequency IN ('IMMEDIATE', 'DAILY', 'WEEKLY')),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notification_email_preference_ward_user_unique UNIQUE (ward_id, user_id)
);

CREATE INDEX IF NOT EXISTS notification_email_preference_ward_user_idx
  ON notification_email_preference (ward_id, user_id);

ALTER TABLE notification_email_preference ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_email_preference FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_email_preference_isolation ON notification_email_preference;
CREATE POLICY notification_email_preference_isolation ON notification_email_preference
USING (
  ward_id = app.current_ward_id()
  AND (
    user_id = app.current_user_id()
    OR app.current_user_id() = '00000000-0000-0000-0000-000000000000'::uuid
  )
)
WITH CHECK (
  ward_id = app.current_ward_id()
  AND (
    user_id = app.current_user_id()
    OR app.current_user_id() = '00000000-0000-0000-0000-000000000000'::uuid
  )
);

CREATE TABLE IF NOT EXISTS notification_email_digest_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES ward(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  event_outbox_id UUID NOT NULL REFERENCES event_outbox(id) ON DELETE CASCADE,
  delivery_id UUID NOT NULL REFERENCES notification_delivery(id) ON DELETE CASCADE,
  digest_frequency TEXT NOT NULL CHECK (digest_frequency IN ('DAILY', 'WEEKLY')),
  scheduled_for TIMESTAMPTZ NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  target_url TEXT,
  attempted_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notification_email_digest_delivery_unique UNIQUE (delivery_id)
);

CREATE INDEX IF NOT EXISTS notification_email_digest_recipient_due_idx
  ON notification_email_digest_item (ward_id, recipient_user_id, digest_frequency, scheduled_for)
  WHERE delivered_at IS NULL;

ALTER TABLE notification_email_digest_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_email_digest_item FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_email_digest_item_isolation ON notification_email_digest_item;
CREATE POLICY notification_email_digest_item_isolation ON notification_email_digest_item
USING (
  ward_id = app.current_ward_id()
  AND (
    recipient_user_id = app.current_user_id()
    OR app.current_user_id() = '00000000-0000-0000-0000-000000000000'::uuid
  )
)
WITH CHECK (
  ward_id = app.current_ward_id()
  AND (
    recipient_user_id = app.current_user_id()
    OR app.current_user_id() = '00000000-0000-0000-0000-000000000000'::uuid
  )
);
