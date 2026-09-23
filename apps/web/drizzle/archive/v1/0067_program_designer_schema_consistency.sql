-- Milestone 5 follow-up: keep relational and JSON schema versions synchronized.
-- Existing v1 rows predate the JSON schemaVersion field; backfill the
-- relational version before adding the enforcing constraints.
UPDATE meeting_document
SET layout_json = jsonb_set(layout_json, '{schemaVersion}', to_jsonb(schema_version), true)
WHERE NOT (layout_json ? 'schemaVersion');

UPDATE document_template_version
SET layout_json = jsonb_set(layout_json, '{schemaVersion}', to_jsonb(schema_version), true)
WHERE NOT (layout_json ? 'schemaVersion');

ALTER TABLE meeting_document
  ADD CONSTRAINT meeting_document_schema_version_matches_json
  CHECK ((layout_json ? 'schemaVersion') AND (layout_json->>'schemaVersion')::int = schema_version);

ALTER TABLE document_template_version
  ADD CONSTRAINT document_template_version_schema_matches_json
  CHECK ((layout_json ? 'schemaVersion') AND (layout_json->>'schemaVersion')::int = schema_version);
