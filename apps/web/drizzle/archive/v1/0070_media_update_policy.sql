-- Milestone 6: make media status transitions callable only through controlled functions.
DROP POLICY IF EXISTS media_asset_update ON public.media_asset;
CREATE POLICY media_asset_update ON public.media_asset FOR UPDATE USING (false) WITH CHECK (false);

ALTER FUNCTION public.lookup_public_media_asset(TEXT) SET row_security = off;
ALTER FUNCTION public.media_asset_archive(UUID, UUID) SET row_security = off;
