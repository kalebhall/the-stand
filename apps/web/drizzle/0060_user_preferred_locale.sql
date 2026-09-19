ALTER TABLE user_account
  ADD COLUMN IF NOT EXISTS preferred_locale TEXT;

ALTER TABLE user_account
  DROP CONSTRAINT IF EXISTS user_account_preferred_locale_check;

ALTER TABLE user_account
  ADD CONSTRAINT user_account_preferred_locale_check
  CHECK (preferred_locale IS NULL OR preferred_locale IN ('en-US', 'es', 'pt-BR', 'tl'));
