CREATE TABLE IF NOT EXISTS ward_feature_settings (
  ward_id UUID PRIMARY KEY REFERENCES ward(id) ON DELETE CASCADE,
  bishopric_agenda BOOLEAN NOT NULL DEFAULT true,
  scheduled_interviews BOOLEAN NOT NULL DEFAULT true,
  technology_checklist BOOLEAN NOT NULL DEFAULT true,
  speaker_lifecycle BOOLEAN NOT NULL DEFAULT true,
  updated_by_user_id UUID REFERENCES user_account(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ward_feature_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ward_feature_settings_isolation ON ward_feature_settings;
CREATE POLICY ward_feature_settings_isolation ON ward_feature_settings
  USING (ward_id = app.current_ward_id())
  WITH CHECK (ward_id = app.current_ward_id());
