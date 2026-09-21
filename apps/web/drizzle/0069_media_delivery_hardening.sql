-- Milestone 6 hardening: public delivery and immutable asset identity.
CREATE OR REPLACE FUNCTION public.lookup_public_media_asset(p_token TEXT)
RETURNS TABLE (storage_key TEXT, mime_type TEXT, alt_text TEXT, is_decorative BOOLEAN)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT m.storage_key, m.mime_type, m.alt_text, m.is_decorative
    FROM public.media_asset m
   WHERE m.public_token = p_token
     AND m.status = 'ACTIVE'
     AND p_token ~ '^[0-9a-f-]{36}$'
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.lookup_public_media_asset(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_public_media_asset(TEXT) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.media_asset_immutable_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.scope_type <> OLD.scope_type OR NEW.ward_id IS DISTINCT FROM OLD.ward_id
     OR NEW.stake_id IS DISTINCT FROM OLD.stake_id OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
     OR NEW.storage_key <> OLD.storage_key OR NOT (NEW.status = OLD.status OR (OLD.status = 'ACTIVE' AND NEW.status IN ('ARCHIVED', 'QUARANTINED')))
     OR (NOT (OLD.status = 'ACTIVE' AND NEW.status IN ('ARCHIVED', 'QUARANTINED')) AND NEW.public_token IS DISTINCT FROM OLD.public_token)
     OR NEW.filename <> OLD.filename OR NEW.mime_type <> OLD.mime_type OR NEW.byte_size <> OLD.byte_size
     OR NEW.pixel_width <> OLD.pixel_width OR NEW.pixel_height <> OLD.pixel_height
     OR NEW.alt_text IS DISTINCT FROM OLD.alt_text OR NEW.is_decorative <> OLD.is_decorative
     OR NEW.created_by_user_id <> OLD.created_by_user_id OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'media asset immutable fields cannot be changed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS media_asset_immutable_fields ON public.media_asset;
CREATE TRIGGER media_asset_immutable_fields
BEFORE UPDATE ON public.media_asset
FOR EACH ROW EXECUTE FUNCTION public.media_asset_immutable_fields();

CREATE OR REPLACE FUNCTION public.media_asset_archive(
  p_ward_id UUID, p_asset_id UUID
)
RETURNS TABLE (id UUID, storage_key TEXT)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
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
  RETURNING m.id, m.storage_key
$$;

REVOKE ALL ON FUNCTION public.media_asset_archive(UUID, UUID) FROM PUBLIC;
