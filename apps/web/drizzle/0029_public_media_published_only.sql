-- Restrict public media activation to published renders and a token-scoped RLS path.
DROP POLICY IF EXISTS media_asset_public_token_read ON public.media_asset;
CREATE POLICY media_asset_public_token_read ON public.media_asset FOR SELECT USING (
  status = 'ACTIVE'
  AND lower(public_token) = NULLIF(current_setting('app.public_media_token', true), '')
);

DROP POLICY IF EXISTS meeting_program_render_public_media_token_read ON public.meeting_program_render;
CREATE POLICY meeting_program_render_public_media_token_read ON public.meeting_program_render FOR SELECT USING (
  published_at IS NOT NULL
  AND render_html ILIKE ('%' || NULLIF(current_setting('app.public_media_token', true), '') || '%')
);

CREATE OR REPLACE FUNCTION public.lookup_public_media_asset(p_token text)
RETURNS TABLE(storage_key text, mime_type text, alt_text text, is_decorative boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
SET row_security TO 'on'
AS $$
BEGIN
  IF p_token IS NULL OR p_token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN;
  END IF;

  PERFORM set_config('app.public_media_token', lower(p_token), true);

  RETURN QUERY
  SELECT m.storage_key, m.mime_type, m.alt_text, m.is_decorative
    FROM public.media_asset m
   WHERE lower(m.public_token) = lower(p_token)
     AND m.status = 'ACTIVE'
     AND EXISTS (
       SELECT 1
         FROM public.meeting_program_render r
        WHERE r.render_html ILIKE ('%' || m.public_token || '%')
          AND r.published_at IS NOT NULL
          AND (
            m.scope_type = 'SYSTEM'
            OR (m.scope_type = 'WARD' AND r.ward_id = m.ward_id)
            OR (m.scope_type = 'STAKE' AND EXISTS (
              SELECT 1 FROM public.ward rw WHERE rw.id = r.ward_id AND rw.stake_id = m.stake_id
            ))
          )
     )
   LIMIT 1;
END;
$$;