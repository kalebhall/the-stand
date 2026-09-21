-- Milestone 6: resolve published public media references across all media scopes.
CREATE OR REPLACE FUNCTION public.lookup_public_media_asset(p_token TEXT)
RETURNS TABLE (storage_key TEXT, mime_type TEXT, alt_text TEXT, is_decorative BOOLEAN)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
  SELECT m.storage_key, m.mime_type, m.alt_text, m.is_decorative
    FROM public.media_asset m
   WHERE m.public_token = p_token
     AND m.status = 'ACTIVE'
     AND p_token ~ '^[0-9a-f-]{36}$'
     AND EXISTS (
       SELECT 1
         FROM public.meeting_program_render r
         JOIN public.ward rw ON rw.id = r.ward_id
        WHERE r.render_html LIKE ('%' || m.public_token || '%')
          AND (
            m.scope_type = 'SYSTEM'
            OR (m.scope_type = 'WARD' AND r.ward_id = m.ward_id)
            OR (m.scope_type = 'STAKE' AND rw.stake_id = m.stake_id)
          )
     )
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.lookup_public_media_asset(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_public_media_asset(TEXT) TO PUBLIC;
