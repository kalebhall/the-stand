CREATE TABLE IF NOT EXISTS ward_stand_template (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES ward(id) ON DELETE CASCADE,
  welcome_text TEXT NOT NULL DEFAULT 'Welcome to The Church of Jesus Christ of Latter-day Saints.',
  sustain_template TEXT NOT NULL DEFAULT 'Those in favor of sustaining **{memberName}** as **{callingName}**, please manifest it.',
  release_template TEXT NOT NULL DEFAULT 'Those who wish to express appreciation for the service of **{memberName}** as **{callingName}**, please do so.',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ward_id)
);

ALTER TABLE ward_stand_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE ward_stand_template FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ward_stand_template_isolation ON ward_stand_template;
CREATE POLICY ward_stand_template_isolation ON ward_stand_template
USING (ward_id = app.current_ward_id())
WITH CHECK (ward_id = app.current_ward_id());
