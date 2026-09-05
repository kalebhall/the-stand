ALTER TABLE public_program_layout
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT,
  ADD COLUMN IF NOT EXISTS cover_image_alt_text TEXT;

ALTER TABLE public_program_layout
  ADD CONSTRAINT public_program_layout_cover_image_url_check
  CHECK (cover_image_url IS NULL OR cover_image_url ~ '^https://');

ALTER TABLE public_program_layout
  ADD CONSTRAINT public_program_layout_cover_alt_text_check
  CHECK (cover_image_url IS NULL OR length(trim(cover_image_alt_text)) BETWEEN 1 AND 240);
