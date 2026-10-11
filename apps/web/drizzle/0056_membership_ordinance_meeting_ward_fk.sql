-- Membership ordinance rows must reference a meeting in their own ward.
-- Temporarily exempt the table owner while validating existing rows. With
-- FORCE RLS active, PostgreSQL applies ward policies to the FK validation scan.
-- The migration runner executes each file in one transaction, so concurrent
-- sessions cannot observe the temporary owner exemption.
ALTER TABLE public.meeting_membership_ordinance NO FORCE ROW LEVEL SECURITY;

ALTER TABLE public.meeting_membership_ordinance
  ADD CONSTRAINT meeting_membership_ordinance_meeting_same_ward_fk
  FOREIGN KEY (ward_id, meeting_id)
  REFERENCES public.meeting (ward_id, id)
  ON DELETE CASCADE
  NOT VALID;

ALTER TABLE public.meeting_membership_ordinance
  VALIDATE CONSTRAINT meeting_membership_ordinance_meeting_same_ward_fk;

ALTER TABLE public.meeting_membership_ordinance
  DROP CONSTRAINT meeting_membership_ordinance_meeting_id_fkey;

ALTER TABLE public.meeting_membership_ordinance FORCE ROW LEVEL SECURITY;
