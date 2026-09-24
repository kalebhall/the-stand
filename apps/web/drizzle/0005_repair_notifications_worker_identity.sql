-- Repair worker ward provisioning so FORCE RLS sees the new ward context and
-- fixture/database resets cannot leave the worker role absent.
DO $$
DECLARE
    worker_user_id uuid := '00000000-0000-0000-0000-000000000000';
    worker_role_id uuid := '00000000-0000-0000-0000-000000000001';
    ward_row record;
    previous_ward text := current_setting('app.ward_id', true);
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.user_account
         WHERE id = worker_user_id
           AND (email IS DISTINCT FROM 'notifications-worker@invalid.local'
             OR display_name IS DISTINCT FROM 'Notifications Worker'
             OR password_hash IS NOT NULL)
    ) THEN
        RAISE EXCEPTION 'Reserved notifications worker user ID collision';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.role
         WHERE id = worker_role_id
           AND (name IS DISTINCT FROM 'NOTIFICATION_WORKER' OR scope IS DISTINCT FROM 'WARD')
    ) THEN
        RAISE EXCEPTION 'Reserved notifications worker role ID collision';
    END IF;
    INSERT INTO public.user_account (id, email, display_name, password_hash, is_active)
    VALUES (worker_user_id, 'notifications-worker@invalid.local', 'Notifications Worker', NULL, true)
    ON CONFLICT (id) DO UPDATE SET is_active = true, password_hash = NULL;
    INSERT INTO public.role (id, name, scope)
    VALUES (worker_role_id, 'NOTIFICATION_WORKER', 'WARD')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, scope = EXCLUDED.scope;

    FOR ward_row IN SELECT id FROM public.ward LOOP
        PERFORM set_config('app.ward_id', ward_row.id::text, true);
        INSERT INTO public.ward_user_role (ward_id, user_id, role_id, grant_reason)
        SELECT ward_row.id, worker_user_id, worker_role_id, 'System notifications worker'
         WHERE NOT EXISTS (
           SELECT 1 FROM public.ward_user_role wur
            WHERE wur.ward_id = ward_row.id
              AND wur.user_id = worker_user_id
              AND wur.role_id = worker_role_id
              AND wur.revoked_at IS NULL
         );
    END LOOP;
    PERFORM set_config('app.ward_id', COALESCE(previous_ward, ''), true);
END $$;

CREATE OR REPLACE FUNCTION app.ensure_notifications_worker_ward_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
SET row_security TO on
AS $$
DECLARE
    previous_ward text := current_setting('app.ward_id', true);
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.user_account
         WHERE id = '00000000-0000-0000-0000-000000000000'::uuid
           AND (email IS DISTINCT FROM 'notifications-worker@invalid.local'
             OR display_name IS DISTINCT FROM 'Notifications Worker'
             OR password_hash IS NOT NULL)
    ) THEN
        RAISE EXCEPTION 'Reserved notifications worker user ID collision';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.role
         WHERE id = '00000000-0000-0000-0000-000000000001'::uuid
           AND (name IS DISTINCT FROM 'NOTIFICATION_WORKER' OR scope IS DISTINCT FROM 'WARD')
    ) THEN
        RAISE EXCEPTION 'Reserved notifications worker role ID collision';
    END IF;
    INSERT INTO public.user_account (id, email, display_name, password_hash, is_active)
    VALUES (
        '00000000-0000-0000-0000-000000000000'::uuid,
        'notifications-worker@invalid.local',
        'Notifications Worker',
        NULL,
        true
    ) ON CONFLICT (id) DO UPDATE SET is_active = true, password_hash = NULL;
    INSERT INTO public.role (id, name, scope)
    VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'NOTIFICATION_WORKER', 'WARD')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, scope = EXCLUDED.scope;

    PERFORM set_config('app.ward_id', NEW.id::text, true);
    INSERT INTO public.ward_user_role (ward_id, user_id, role_id, grant_reason)
    SELECT NEW.id,
           '00000000-0000-0000-0000-000000000000'::uuid,
           '00000000-0000-0000-0000-000000000001'::uuid,
           'System notifications worker'
     WHERE NOT EXISTS (
       SELECT 1 FROM public.ward_user_role wur
        WHERE wur.ward_id = NEW.id
          AND wur.user_id = '00000000-0000-0000-0000-000000000000'::uuid
          AND wur.role_id = '00000000-0000-0000-0000-000000000001'::uuid
          AND wur.revoked_at IS NULL
     );
    PERFORM set_config('app.ward_id', COALESCE(previous_ward, ''), true);
    RETURN NEW;
END;
$$;
