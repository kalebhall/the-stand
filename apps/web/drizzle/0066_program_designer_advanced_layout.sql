-- Milestone 5: version 2 layouts are stored in the existing JSON document columns.
-- The check makes the supported persisted schema versions explicit without adding a relational table.
ALTER TABLE meeting_document
  ADD CONSTRAINT meeting_document_schema_version_supported
  CHECK (schema_version IN (1, 2));

ALTER TABLE document_template_version
  ADD CONSTRAINT document_template_version_schema_supported
  CHECK (schema_version IN (1, 2));
