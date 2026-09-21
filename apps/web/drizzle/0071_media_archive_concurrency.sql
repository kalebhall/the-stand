-- Milestone 6 final archive concurrency and execution contract hardening.
CREATE OR REPLACE FUNCTION public.media_asset_archive(
  p_ward_id UUID, p_asset_id UUID
)
RETURNS TABLE (id UUID, storage_key TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app
SET row_security = off
AS $$
BEGIN
  IF p_ward_id IS DISTINCT FROM app.current_ward_id() THEN
    RAISE EXCEPTION 'media archive ward context mismatch' USING ERRCODE = '42501';
  END IF;

  -- Prevent a concurrent document or published-render insert from adding a reference
  -- after the NOT EXISTS checks and before the archive commits.
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

GRANT EXECUTE ON FUNCTION public.lookup_public_media_asset(TEXT) TO CURRENT_USER;
GRANT EXECUTE ON FUNCTION public.media_asset_archive(UUID, UUID) TO CURRENT_USER;
