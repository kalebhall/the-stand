-- Allow privacy backfill to inspect ward membership rows while the migration role
-- owns FORCE RLS tables. 0042 restores both enforcement boundaries.
ALTER TABLE public.notification_delivery NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ward_user_role NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.event_outbox NO FORCE ROW LEVEL SECURITY;
