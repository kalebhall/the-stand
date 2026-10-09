-- Allow a ward to select either a published ward template or a built-in template as the default for new meetings.
ALTER TABLE public.ward_document_settings
  ADD COLUMN default_sacrament_template_key text;
