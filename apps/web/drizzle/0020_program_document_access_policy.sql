DROP POLICY IF EXISTS program_document_ward_isolation ON public.program_document;
CREATE POLICY program_document_ward_isolation
  ON public.program_document
  USING (ward_id = app.current_ward_id() AND app.has_active_ward_access(ward_id))
  WITH CHECK (ward_id = app.current_ward_id() AND app.has_active_ward_access(ward_id));
