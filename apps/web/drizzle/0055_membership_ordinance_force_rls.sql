-- Membership and ordinance records contain ward-private member information.
-- Enforce the active ward boundary in PostgreSQL, not only in route predicates.
CREATE POLICY meeting_membership_ordinance_select_ward
  ON public.meeting_membership_ordinance
  FOR SELECT
  USING (ward_id = app.current_ward_id() AND app.has_active_ward_access(ward_id));

CREATE POLICY meeting_membership_ordinance_insert_ward
  ON public.meeting_membership_ordinance
  FOR INSERT
  WITH CHECK (ward_id = app.current_ward_id() AND app.has_active_ward_access(ward_id));

CREATE POLICY meeting_membership_ordinance_update_ward
  ON public.meeting_membership_ordinance
  FOR UPDATE
  USING (ward_id = app.current_ward_id() AND app.has_active_ward_access(ward_id))
  WITH CHECK (ward_id = app.current_ward_id() AND app.has_active_ward_access(ward_id));

CREATE POLICY meeting_membership_ordinance_delete_ward
  ON public.meeting_membership_ordinance
  FOR DELETE
  USING (ward_id = app.current_ward_id() AND app.has_active_ward_access(ward_id));

ALTER TABLE public.meeting_membership_ordinance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_membership_ordinance FORCE ROW LEVEL SECURITY;
