-- Classify ward stand templates and preserve source metadata separately from editable text.
ALTER TABLE ward_stand_template
  ADD COLUMN IF NOT EXISTS template_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE ward_stand_template
SET template_metadata = jsonb_build_object(
  'welcomeText', jsonb_build_object('classification', 'WARD_PROMPT'),
  'sustainTemplate', jsonb_build_object('classification', 'OFFICIAL_EXAMPLE'),
  'releaseTemplate', jsonb_build_object('classification', 'WARD_PROMPT'),
  'welcomeNewMemberTemplate', jsonb_build_object('classification', 'WARD_PROMPT'),
  'recognizeBaptizedChildTemplate', jsonb_build_object('classification', 'WARD_PROMPT'),
  'babyBlessingTemplate', jsonb_build_object('classification', 'OFFICIAL_REQUIRED_ELEMENTS'),
  'priesthoodOrdinationTemplate', jsonb_build_object('classification', 'OFFICIAL_EXAMPLE'),
  'priesthoodAdvancementTemplate', jsonb_build_object('classification', 'OFFICIAL_EXAMPLE')
)
WHERE template_metadata = '{}'::jsonb;
