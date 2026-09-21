-- Milestone 6: ward/stake/system media assets with private opaque storage keys.
CREATE TABLE IF NOT EXISTS media_asset (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('SYSTEM', 'STAKE', 'WARD')),
  ward_id UUID REFERENCES ward(id) ON DELETE CASCADE,
  stake_id UUID REFERENCES stake(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES user_account(id) ON DELETE SET NULL,
  filename TEXT NOT NULL CHECK (length(trim(filename)) BETWEEN 1 AND 255),
  storage_key TEXT NOT NULL UNIQUE,
  public_token TEXT UNIQUE,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 10485760),
  pixel_width INTEGER NOT NULL CHECK (pixel_width > 0 AND pixel_width <= 25000000),
  pixel_height INTEGER NOT NULL CHECK (pixel_height > 0 AND pixel_height <= 25000000),
  alt_text TEXT,
  is_decorative BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED', 'QUARANTINED')),
  created_by_user_id UUID NOT NULL REFERENCES user_account(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((scope_type = 'WARD' AND ward_id IS NOT NULL AND stake_id IS NULL) OR
         (scope_type = 'STAKE' AND ward_id IS NULL AND stake_id IS NOT NULL) OR
         (scope_type = 'SYSTEM' AND ward_id IS NULL AND stake_id IS NULL)),
  CHECK (is_decorative OR length(trim(coalesce(alt_text, ''))) > 0)
);

CREATE INDEX IF NOT EXISTS media_asset_ward_status_created_idx ON media_asset (ward_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS media_asset_scope_status_created_idx ON media_asset (scope_type, status, created_at DESC);

ALTER TABLE media_asset ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_asset FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS media_asset_read ON media_asset;
CREATE POLICY media_asset_read ON media_asset FOR SELECT USING (
  status = 'ACTIVE' AND (
    scope_type = 'SYSTEM' OR
    (scope_type = 'WARD' AND ward_id = app.current_ward_id()) OR
    (scope_type = 'STAKE' AND stake_id = (SELECT w.stake_id FROM ward w WHERE w.id = app.current_ward_id()))
  )
);

DROP POLICY IF EXISTS media_asset_write ON media_asset;
CREATE POLICY media_asset_write ON media_asset FOR INSERT WITH CHECK (
  scope_type = 'WARD' AND ward_id = app.current_ward_id() AND created_by_user_id = app.current_user_id()
);

DROP POLICY IF EXISTS media_asset_update ON media_asset;
CREATE POLICY media_asset_update ON media_asset FOR UPDATE USING (
  scope_type = 'WARD' AND ward_id = app.current_ward_id()
) WITH CHECK (
  scope_type = 'WARD' AND ward_id = app.current_ward_id()
);

DROP POLICY IF EXISTS media_asset_archive ON media_asset;
CREATE POLICY media_asset_archive ON media_asset FOR DELETE USING (false);
