-- Allow the forward notification-delivery migrations to normalize legacy rows
-- when the disposable migration role owns a FORCE RLS table. 0042 restores FORCE RLS.
ALTER TABLE public.notification_delivery NO FORCE ROW LEVEL SECURITY;
