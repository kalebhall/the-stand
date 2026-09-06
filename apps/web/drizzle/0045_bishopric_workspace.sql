CREATE TABLE IF NOT EXISTS bishopric_meeting (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES ward(id) ON DELETE CASCADE,
  meeting_date DATE NOT NULL,
  agenda_template TEXT NOT NULL DEFAULT 'BISHOPRIC',
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'COMPLETED')),
  created_by_user_id UUID NOT NULL REFERENCES user_account(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bishopric_meeting_ward_date_idx ON bishopric_meeting (ward_id, meeting_date DESC);

CREATE TABLE IF NOT EXISTS bishopric_action (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES ward(id) ON DELETE CASCADE,
  bishopric_meeting_id UUID NOT NULL REFERENCES bishopric_meeting(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  details TEXT,
  decision TEXT,
  owner_name TEXT,
  due_date DATE,
  visibility TEXT NOT NULL DEFAULT 'PRIVATE' CHECK (visibility = 'PRIVATE'),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED')),
  carry_forward BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  completed_by_user_id UUID REFERENCES user_account(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bishopric_action_ward_due_idx ON bishopric_action (ward_id, due_date, status);
