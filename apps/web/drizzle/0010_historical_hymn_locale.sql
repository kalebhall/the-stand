ALTER TABLE public.meeting_program_item
  ADD COLUMN IF NOT EXISTS hymn_locale text NOT NULL DEFAULT 'en-US';
