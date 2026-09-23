CREATE TABLE IF NOT EXISTS offline_mutation (
  mutation_id UUID PRIMARY KEY,
  ward_id UUID NOT NULL REFERENCES ward(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  operation TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('APPLIED', 'CONFLICT', 'REJECTED')),
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS offline_mutation_user_idx ON offline_mutation (user_id, created_at DESC);
ALTER TABLE offline_mutation ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_mutation FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS offline_mutation_isolation ON offline_mutation;
CREATE POLICY offline_mutation_isolation ON offline_mutation
USING (ward_id = app.current_ward_id() AND user_id = app.current_user_id())
WITH CHECK (ward_id = app.current_ward_id() AND user_id = app.current_user_id());
