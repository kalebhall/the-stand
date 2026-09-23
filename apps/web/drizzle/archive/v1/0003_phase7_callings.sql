CREATE TABLE IF NOT EXISTS calling_assignment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES ward(id) ON DELETE CASCADE,
  member_name TEXT NOT NULL,
  calling_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calling_action (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES ward(id) ON DELETE CASCADE,
  calling_assignment_id UUID NOT NULL REFERENCES calling_assignment(id) ON DELETE CASCADE,
  action_status TEXT NOT NULL CHECK (action_status IN ('PROPOSED', 'EXTENDED', 'SUSTAINED', 'SET_APART')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meeting_business_line (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES ward(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES meeting(id) ON DELETE CASCADE,
  member_name TEXT NOT NULL,
  calling_name TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('SUSTAIN', 'RELEASE')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'included', 'excluded', 'announced')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE calling_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE calling_assignment FORCE ROW LEVEL SECURITY;
ALTER TABLE calling_action ENABLE ROW LEVEL SECURITY;
ALTER TABLE calling_action FORCE ROW LEVEL SECURITY;
ALTER TABLE meeting_business_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_business_line FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS calling_assignment_isolation ON calling_assignment;
CREATE POLICY calling_assignment_isolation ON calling_assignment
USING (ward_id = app.current_ward_id())
WITH CHECK (ward_id = app.current_ward_id());

DROP POLICY IF EXISTS calling_action_isolation ON calling_action;
CREATE POLICY calling_action_isolation ON calling_action
USING (ward_id = app.current_ward_id())
WITH CHECK (ward_id = app.current_ward_id());

DROP POLICY IF EXISTS meeting_business_line_isolation ON meeting_business_line;
CREATE POLICY meeting_business_line_isolation ON meeting_business_line
USING (ward_id = app.current_ward_id())
WITH CHECK (ward_id = app.current_ward_id());
