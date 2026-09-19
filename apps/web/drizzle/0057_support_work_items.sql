CREATE TABLE IF NOT EXISTS support_work_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL CHECK (source_type IN ('ACCESS_REQUEST', 'USER_ACCOUNT')),
  source_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'UNASSIGNED'
    CHECK (status IN ('UNASSIGNED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED')),
  assigned_to_user_id UUID REFERENCES user_account(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT support_work_item_source_unique UNIQUE (source_type, source_id)
);

CREATE INDEX IF NOT EXISTS support_work_item_queue_idx
  ON support_work_item (status, created_at DESC);

CREATE INDEX IF NOT EXISTS support_work_item_assignee_idx
  ON support_work_item (assigned_to_user_id, status, updated_at DESC);
