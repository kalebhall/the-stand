ALTER TABLE ward
  ADD COLUMN IF NOT EXISTS default_locale text NOT NULL DEFAULT 'en-US';

ALTER TABLE hymn
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'en-US';

CREATE INDEX IF NOT EXISTS hymn_locale_active_sort_idx
  ON hymn (locale, is_active, sort_key);