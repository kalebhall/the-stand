-- Restore the notification-delivery, ward-membership, and event-outbox RLS boundaries after legacy-data migrations finish.
ALTER TABLE public.notification_delivery FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ward_user_role FORCE ROW LEVEL SECURITY;
ALTER TABLE public.event_outbox FORCE ROW LEVEL SECURITY;
