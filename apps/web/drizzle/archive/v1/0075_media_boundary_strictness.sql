-- Milestone 6: strict public-token validation and ward-role scope enforcement.
CREATE OR REPLACE FUNCTION public.media_asset_archive(
  p_ward_id UUID, p_asset_id UUID
)
RETURNS TABLE (id UUID, storage_key TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
BEGIN
  IF p_ward_id IS DISTINCT FROM app.current_ward_id() THEN
    RAISE EXCEPTION 'media archive ward context mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM ward_user_role wur
      JOIN role r ON r.id = wur.role_id
      JOIN user_account ua ON ua.id = wur.user_id
     WHERE wur.ward_id = p_ward_id
       AND wur.user_id = app.current_user_id()
       AND wur.revoked_at IS NULL
       AND (wur.expires_at IS NULL OR wur.expires_at > now())
       AND ua.is_active = true
       AND r.scope = 'WARD'
       AND (
         r.name IN ('STAND_ADMIN', 'BISHOPRIC_EDITOR')
         OR (r.name = 'PROGRAM_EDITOR' AND EXISTS (
           SELECT 1 FROM ward_document_settings wds
            WHERE wds.ward_id = p_ward_id
              AND wds.allow_program_editor_delete_media = true
         ))
       )
  ) THEN
    RAISE EXCEPTION 'media archive capability denied' USING ERRCODE = '42501';
  END IF;

  LOCK TABLE public.meeting_document, public.meeting_program_render IN SHARE MODE;

  RETURN QUERY
  UPDATE public.media_asset m
     SET status = 'ARCHIVED', public_token = NULL, updated_at = now()
   WHERE m.id = p_asset_id
     AND m.ward_id = p_ward_id
     AND m.scope_type = 'WARD'
     AND m.status = 'ACTIVE'
     AND NOT EXISTS (
       SELECT 1 FROM public.meeting_document md
        WHERE md.ward_id = m.ward_id
          AND md.layout_json::text LIKE ('%' || m.id::text || '%')
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.meeting_program_render r
        WHERE r.ward_id = m.ward_id
          AND r.render_html LIKE ('%' || m.public_token || '%')
     )
  RETURNING m.id, m.storage_key;
END
$$;

REVOKE ALL ON FUNCTION public.media_asset_archive(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.media_asset_archive(UUID, UUID) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.lookup_public_media_asset(p_token TEXT)
RETURNS TABLE (storage_key TEXT, mime_type TEXT, alt_text TEXT, is_decorative BOOLEAN)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
  SELECT m.storage_key, m.mime_type, m.alt_text, m.is_decorative
    FROM public.media_asset m
   WHERE lower(m.public_token) = lower(p_token)
     AND m.status = 'ACTIVE'
     AND p_token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND EXISTS (
       SELECT 1
         FROM public.meeting_program_render r
         JOIN public.ward rw ON rw.id = r.ward_id
        WHERE r.render_html ILIKE ('%' || m.public_token || '%')
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
