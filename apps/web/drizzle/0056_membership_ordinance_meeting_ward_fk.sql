-- Membership ordinance rows must reference a meeting in their own ward.
-- Validate existing rows before retiring the weaker single-column FK.
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
