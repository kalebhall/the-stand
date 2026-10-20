-- Require every active sacrament-program share to point at a snapshot
-- produced under the current public-safety contract. Legacy immutable snapshots
-- remain available in history but must be republished before activation.
CREATE OR REPLACE FUNCTION public.validate_public_program_share_active_render()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.active_render_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.meeting_program_render AS render
       WHERE render.id = NEW.active_render_id
         AND render.ward_id = NEW.ward_id
         AND render.meeting_id = NEW.meeting_id
         AND render.published_at IS NOT NULL
         AND render.layout_json IS NOT NULL
         AND render.render_data_json IS NOT NULL
         AND render.publication_metadata_json @> '{"publicSafetyVersion":1}'::jsonb
     ) THEN
    RAISE EXCEPTION 'active public program render must be published, complete, public-safe, and match the share ward and meeting'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_public_program_share_active_render() IS
  'Enforces same-meeting, published, complete, public-safety-versioned snapshots for active program shares.';
