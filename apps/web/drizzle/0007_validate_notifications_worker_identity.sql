-- Refuse deployment if the reserved worker identifiers do not describe the
-- exact non-login identity and role expected by the notifications worker.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.user_account
         WHERE id = '00000000-0000-0000-0000-000000000000'::uuid
           AND email = 'notifications-worker@invalid.local'
           AND display_name = 'Notifications Worker'
           AND password_hash IS NULL
    ) THEN
        RAISE EXCEPTION 'Notifications worker user identity is missing or collides with another account';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.role
         WHERE id = '00000000-0000-0000-0000-000000000001'::uuid
           AND name = 'NOTIFICATION_WORKER'
           AND scope = 'WARD'
    ) THEN
        RAISE EXCEPTION 'Notifications worker role identity is missing or collides with another role';
    END IF;
END $$;
