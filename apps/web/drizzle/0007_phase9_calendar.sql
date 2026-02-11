CREATE TABLE IF NOT EXISTS calendar_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES ward(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  feed_scope TEXT NOT NULL CHECK (feed_scope IN ('WARD', 'STAKE', 'CHURCH')),
  feed_url TEXT NOT NULL,
  tag_map JSONB,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_refreshed_at TIMESTAMPTZ,
  last_refresh_status TEXT,
  last_refresh_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ward_id, feed_url)
);

CREATE TABLE IF NOT EXISTS calendar_event_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES ward(id) ON DELETE CASCADE,
  calendar_feed_id UUID NOT NULL REFERENCES calendar_feed(id) ON DELETE CASCADE,
  external_uid TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  all_day BOOLEAN NOT NULL DEFAULT FALSE,
  tags TEXT[] NOT NULL DEFAULT '{}',
  source_updated_at TIMESTAMPTZ,
  copied_to_announcement_at TIMESTAMPTZ,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ward_id, calendar_feed_id, external_uid, starts_at)
);

CREATE INDEX IF NOT EXISTS calendar_event_cache_ward_starts_idx ON calendar_event_cache (ward_id, starts_at DESC);

ALTER TABLE calendar_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_feed FORCE ROW LEVEL SECURITY;
ALTER TABLE calendar_event_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_event_cache FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS calendar_feed_isolation ON calendar_feed;
CREATE POLICY calendar_feed_isolation ON calendar_feed
USING (ward_id = app.current_ward_id())
WITH CHECK (ward_id = app.current_ward_id());

DROP POLICY IF EXISTS calendar_event_cache_isolation ON calendar_event_cache;
CREATE POLICY calendar_event_cache_isolation ON calendar_event_cache
USING (ward_id = app.current_ward_id())
WITH CHECK (ward_id = app.current_ward_id());
