ALTER TABLE document_template ADD COLUMN IF NOT EXISTS template_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS document_template_template_key_unique ON document_template (template_key) WHERE template_key IS NOT NULL;

ALTER TABLE document_template NO FORCE ROW LEVEL SECURITY;
ALTER TABLE document_template_version NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  definition RECORD;
  template_id UUID;
  version_id UUID;
  layout JSONB := jsonb_build_object(
    'id', '00000000-0000-4000-8000-000000000001',
    'schemaVersion', 1,
    'documentType', 'SACRAMENT_PROGRAM',
    'paper', 'LETTER',
    'orientation', 'PORTRAIT',
    'fold', 'NONE',
    'theme', jsonb_build_object('fontFamily', 'SYSTEM_SANS', 'baseFontSize', 12, 'accentColor', '#1f2937'),
    'pages', jsonb_build_array(jsonb_build_object(
      'id', '00000000-0000-4000-8000-000000000002',
      'regions', jsonb_build_array(jsonb_build_object(
        'id', '00000000-0000-4000-8000-000000000003',
        'ratio', 1,
        'gutter', 0,
        'blocks', jsonb_build_array(
          jsonb_build_object('id', '00000000-0000-4000-8000-000000000011', 'type', 'DOCUMENT_TITLE', 'width', 'FULL', 'dataMode', 'MANUAL', 'visibility', 'VISIBLE', 'printBehavior', 'PRINT_AND_DIGITAL', 'digitalBehavior', 'NORMAL', 'config', jsonb_build_object('text', 'Sacrament Meeting')),
          jsonb_build_object('id', '00000000-0000-4000-8000-000000000012', 'type', 'WARD_NAME', 'width', 'FULL', 'dataMode', 'AUTO', 'visibility', 'VISIBLE', 'printBehavior', 'PRINT_AND_DIGITAL', 'digitalBehavior', 'NORMAL', 'config', jsonb_build_object('text', 'Ward')),
          jsonb_build_object('id', '00000000-0000-4000-8000-000000000013', 'type', 'MEETING_INFO', 'width', 'FULL', 'dataMode', 'AUTO', 'visibility', 'VISIBLE', 'printBehavior', 'PRINT_AND_DIGITAL', 'digitalBehavior', 'NORMAL', 'config', jsonb_build_object('includeDate', true, 'includeTime', true, 'includeLocation', true)),
          jsonb_build_object('id', '00000000-0000-4000-8000-000000000014', 'type', 'MEETING_PROGRAM', 'width', 'FULL', 'dataMode', 'AUTO', 'visibility', 'VISIBLE', 'printBehavior', 'PRINT_AND_DIGITAL', 'digitalBehavior', 'NORMAL', 'config', jsonb_build_object('items', jsonb_build_array())),
          jsonb_build_object('id', '00000000-0000-4000-8000-000000000015', 'type', 'ANNOUNCEMENTS', 'width', 'FULL', 'dataMode', 'AUTO', 'visibility', 'VISIBLE', 'printBehavior', 'PRINT_AND_DIGITAL', 'digitalBehavior', 'NORMAL', 'config', jsonb_build_object('text', '')),
          jsonb_build_object('id', '00000000-0000-4000-8000-000000000016', 'type', 'QR_CODE', 'width', 'FULL', 'dataMode', 'MANUAL', 'visibility', 'VISIBLE', 'printBehavior', 'PRINT_AND_DIGITAL', 'digitalBehavior', 'NORMAL', 'config', jsonb_build_object('href', 'https://example.com', 'label', 'Open digital program'))
        )
      ))
    ))
  );
BEGIN
  FOR definition IN
    SELECT * FROM (VALUES
      ('classic-bifold', 'Classic Bifold', 'Traditional folded program with a balanced reading order.'),
      ('trifold-bulletin', 'Trifold Bulletin', 'Compact three-panel bulletin layout.'),
      ('full-page-standard', 'Full Page Standard', 'Readable single-page program for digital and print use.'),
      ('modern-minimal', 'Modern Minimal', 'Clean text-first layout with restrained visual hierarchy.'),
      ('compact-one-page', 'Compact One Page', 'Dense one-page format for shorter programs.'),
      ('large-print', 'Large Print', 'Simplified layout intended for comfortable reading.'),
      ('image-cover', 'Image Cover', 'Text-first program with an authorized image-cover metadata slot.'),
      ('announcement-focus', 'Announcement Focus', 'Program layout that gives approved announcements clear emphasis.')
    ) AS templates(template_key, name, description)
  LOOP
    template_id := NULL;
    version_id := NULL;
    layout := jsonb_set(
      layout,
      '{pages,0,regions,0,blocks,0,config,text}',
      to_jsonb(definition.name)
    );
    layout := jsonb_set(
      layout,
      '{fold}',
      to_jsonb(CASE definition.template_key
        WHEN 'classic-bifold' THEN 'BIFOLD'
        WHEN 'trifold-bulletin' THEN 'TRIFOLD'
        ELSE 'NONE'
      END)
    );
    layout := jsonb_set(
      layout,
      '{metadata}',
      jsonb_build_object(
        'builtInKey', definition.template_key,
        'name', definition.name,
        'description', definition.description,
        'legacyPreset', CASE definition.template_key
          WHEN 'classic-bifold' THEN 'SINGLE_SHEET_BIFOLD'
          WHEN 'trifold-bulletin' THEN 'TRI_FOLD_BULLETIN'
          ELSE 'FULL_PAGE'
        END,
        'announcementMode', 'AFTER_PROGRAM',
        'coverMode', CASE WHEN definition.template_key = 'image-cover' THEN 'AUTHORIZED_IMAGE' ELSE 'NONE' END
      )
    );
    INSERT INTO document_template (scope_type, scope_id, template_key, document_type, name, description, status)
    VALUES ('SYSTEM', NULL, definition.template_key, 'SACRAMENT_PROGRAM', definition.name, definition.description, 'PUBLISHED')
    ON CONFLICT (template_key) WHERE template_key IS NOT NULL DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description
    RETURNING id INTO template_id;

    IF template_id IS NULL THEN
      SELECT id INTO template_id FROM document_template WHERE template_key = definition.template_key;
    END IF;

    INSERT INTO document_template_version (template_id, version, schema_version, layout_json, theme_json, lock_json)
    VALUES (template_id, 1, 1, layout, jsonb_build_object('fontFamily', 'SYSTEM_SANS', 'baseFontSize', 12, 'accentColor', '#1f2937'), '{}'::jsonb)
    ON CONFLICT (template_id, version) DO UPDATE SET
      schema_version = EXCLUDED.schema_version,
      layout_json = EXCLUDED.layout_json,
      theme_json = EXCLUDED.theme_json,
      lock_json = EXCLUDED.lock_json
    RETURNING id INTO version_id;

    IF version_id IS NULL THEN
      SELECT dtv.id INTO version_id FROM document_template_version AS dtv WHERE dtv.template_id = template_id AND dtv.version = 1;
    END IF;

    UPDATE document_template SET current_published_version_id = version_id, status = 'PUBLISHED', updated_at = now()
    WHERE id = template_id;
  END LOOP;
END $$;

ALTER TABLE document_template FORCE ROW LEVEL SECURITY;
ALTER TABLE document_template_version FORCE ROW LEVEL SECURITY;
