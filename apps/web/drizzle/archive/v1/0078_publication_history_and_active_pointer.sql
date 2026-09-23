-- Milestone 8 Task 1: publication metadata and an explicit public render pointer.
-- Forward-only and rerunnable. Existing renders, shares, tokens, and layouts are preserved.

ALTER TABLE public.meeting_program_render
  ADD COLUMN IF NOT EXISTS document_type TEXT NOT NULL DEFAULT 'SACRAMENT_PROGRAM',
  ADD COLUMN IF NOT EXISTS source_template_id UUID,
  ADD COLUMN IF NOT EXISTS source_template_version INTEGER,
  ADD COLUMN IF NOT EXISTS published_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS publication_metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.public_program_share
  ADD COLUMN IF NOT EXISTS active_render_id UUID,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Normalize only the incomplete structured pair. The legacy HTML and row remain intact;
-- historical NULL/NULL rows remain intentionally valid for renders predating 0076.
-- 0077 protects this pair with a BEFORE UPDATE trigger. Disable only that known
-- trigger for this controlled, loss-preserving migration normalization.
ALTER TABLE public.meeting_program_render
  DISABLE TRIGGER meeting_program_render_print_inputs_immutable;
UPDATE public.meeting_program_render
SET layout_json = NULL,
    render_data_json = NULL
WHERE (layout_json IS NULL) <> (render_data_json IS NULL);
ALTER TABLE public.meeting_program_render
  ENABLE TRIGGER meeting_program_render_print_inputs_immutable;

-- Existing rows are made compatible before tightening the new column contracts.
UPDATE public.meeting_program_render
SET document_type = 'SACRAMENT_PROGRAM'
WHERE document_type IS NULL;
UPDATE public.meeting_program_render
SET published_at = now()
WHERE published_at IS NULL;
UPDATE public.meeting_program_render
SET publication_metadata_json = '{}'::jsonb
WHERE publication_metadata_json IS NULL;
UPDATE public.public_program_share
SET updated_at = now()
WHERE updated_at IS NULL;

ALTER TABLE public.meeting_program_render
  ALTER COLUMN document_type SET DEFAULT 'SACRAMENT_PROGRAM',
  ALTER COLUMN document_type SET NOT NULL,
  ALTER COLUMN published_at SET DEFAULT now(),
  ALTER COLUMN published_at SET NOT NULL,
  ALTER COLUMN publication_metadata_json SET DEFAULT '{}'::jsonb,
  ALTER COLUMN publication_metadata_json SET NOT NULL;
ALTER TABLE public.public_program_share
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meeting_program_render_document_type_check') THEN
    ALTER TABLE public.meeting_program_render
      ADD CONSTRAINT meeting_program_render_document_type_check
      CHECK (document_type = 'SACRAMENT_PROGRAM');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meeting_program_render_layout_json_render_data_json_consistent') THEN
    ALTER TABLE public.meeting_program_render
      ADD CONSTRAINT meeting_program_render_layout_json_render_data_json_consistent
      CHECK ((layout_json IS NULL AND render_data_json IS NULL)
          OR (layout_json IS NOT NULL AND render_data_json IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meeting_program_render_publication_metadata_json_shape') THEN
    ALTER TABLE public.meeting_program_render
      ADD CONSTRAINT meeting_program_render_publication_metadata_json_shape
      CHECK (jsonb_typeof(publication_metadata_json) = 'object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meeting_program_render_source_template_pair') THEN
    ALTER TABLE public.meeting_program_render
      ADD CONSTRAINT meeting_program_render_source_template_pair
      CHECK ((source_template_id IS NULL AND source_template_version IS NULL)
          OR (source_template_id IS NOT NULL AND source_template_version IS NOT NULL AND source_template_version > 0));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meeting_program_render_published_by_user_id_fkey') THEN
    ALTER TABLE public.meeting_program_render
      ADD CONSTRAINT meeting_program_render_published_by_user_id_fkey
      FOREIGN KEY (published_by_user_id) REFERENCES public.user_account(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meeting_program_render_source_template_fk') THEN
    ALTER TABLE public.meeting_program_render
      ADD CONSTRAINT meeting_program_render_source_template_fk
      FOREIGN KEY (source_template_id) REFERENCES public.document_template(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meeting_program_render_source_template_version_fk') THEN
    ALTER TABLE public.meeting_program_render
      ADD CONSTRAINT meeting_program_render_source_template_version_fk
      FOREIGN KEY (source_template_id, source_template_version)
      REFERENCES public.document_template_version(template_id, version) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meeting_program_render_id_ward_meeting_unique') THEN
    ALTER TABLE public.meeting_program_render
      ADD CONSTRAINT meeting_program_render_id_ward_meeting_unique UNIQUE (id, ward_id, meeting_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meeting_ward_id_unique') THEN
    ALTER TABLE public.meeting
      ADD CONSTRAINT meeting_ward_id_unique UNIQUE (ward_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'public_program_share_meeting_same_ward_fk') THEN
    ALTER TABLE public.public_program_share
      ADD CONSTRAINT public_program_share_meeting_same_ward_fk
      FOREIGN KEY (ward_id, meeting_id) REFERENCES public.meeting(ward_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'public_program_share_active_render_same_meeting_ward_fk') THEN
    ALTER TABLE public.public_program_share
      ADD CONSTRAINT public_program_share_active_render_same_meeting_ward_fk
      FOREIGN KEY (active_render_id, ward_id, meeting_id)
      REFERENCES public.meeting_program_render(id, ward_id, meeting_id)
      ON DELETE RESTRICT;
  END IF;
END
$$;

-- Migration backfills must see all wards even though these tables remain RLS-protected
-- for application sessions. Restore FORCE before the migration completes.
ALTER TABLE public.meeting_program_render NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.public_program_share NO FORCE ROW LEVEL SECURITY;

-- Deterministic selection: highest render version, then creation time, then UUID.
WITH ranked_renders AS (
  SELECT DISTINCT ON (r.ward_id, r.meeting_id)
    r.ward_id, r.meeting_id, r.id AS render_id
  FROM public.meeting_program_render AS r
  WHERE r.published_at IS NOT NULL
    AND r.layout_json IS NOT NULL
    AND r.render_data_json IS NOT NULL
  ORDER BY r.ward_id, r.meeting_id, r.version DESC, r.created_at DESC, r.id DESC
)
UPDATE public.public_program_share AS share
SET active_render_id = ranked.render_id
FROM ranked_renders AS ranked
WHERE share.active_render_id IS NULL
  AND share.ward_id = ranked.ward_id
  AND share.meeting_id = ranked.meeting_id;

-- Backfill expiration only where the selected render and a positive ward policy exist.
-- make_interval avoids interpolating an untrusted interval literal.
WITH selected_renders AS (
  SELECT DISTINCT ON (r.ward_id, r.meeting_id)
    r.ward_id, r.meeting_id, r.id, r.published_at
  FROM public.meeting_program_render AS r
  WHERE r.published_at IS NOT NULL
    AND r.layout_json IS NOT NULL
    AND r.render_data_json IS NOT NULL
  ORDER BY r.ward_id, r.meeting_id, r.version DESC, r.created_at DESC, r.id DESC
)
UPDATE public.public_program_share AS share
SET expires_at = selected.published_at + make_interval(days => settings.public_program_expiration_days)
FROM selected_renders AS selected
JOIN public.ward_document_settings AS settings
  ON settings.ward_id = selected.ward_id
WHERE share.expires_at IS NULL
  AND share.active_render_id = selected.id
  AND share.ward_id = selected.ward_id
  AND share.meeting_id = selected.meeting_id
  AND selected.published_at IS NOT NULL
  AND settings.public_program_expiration_days IS NOT NULL
  AND settings.public_program_expiration_days > 0;

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
     ) THEN
    RAISE EXCEPTION 'active public program render must be published and match the share ward and meeting' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'public_program_share_active_render_published_guard') THEN
    CREATE TRIGGER public_program_share_active_render_published_guard
    BEFORE INSERT OR UPDATE ON public.public_program_share
    FOR EACH ROW EXECUTE FUNCTION public.validate_public_program_share_active_render();
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.prevent_published_render_publication_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.published_at IS NOT NULL THEN
      RAISE EXCEPTION 'published render cannot be deleted' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.published_at IS NOT NULL
     AND (OLD.id IS DISTINCT FROM NEW.id
       OR OLD.ward_id IS DISTINCT FROM NEW.ward_id
       OR OLD.meeting_id IS DISTINCT FROM NEW.meeting_id
       OR OLD.version IS DISTINCT FROM NEW.version
       OR OLD.render_html IS DISTINCT FROM NEW.render_html
       OR OLD.layout_json IS DISTINCT FROM NEW.layout_json
       OR OLD.render_data_json IS DISTINCT FROM NEW.render_data_json
       OR OLD.document_type IS DISTINCT FROM NEW.document_type
       OR OLD.source_template_id IS DISTINCT FROM NEW.source_template_id
       OR OLD.source_template_version IS DISTINCT FROM NEW.source_template_version
       OR OLD.published_by_user_id IS DISTINCT FROM NEW.published_by_user_id
       OR OLD.published_at IS DISTINCT FROM NEW.published_at
       OR OLD.created_at IS DISTINCT FROM NEW.created_at
       OR OLD.publication_metadata_json IS DISTINCT FROM NEW.publication_metadata_json) THEN
    RAISE EXCEPTION 'published render publication metadata is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'meeting_program_render_publication_immutable') THEN
    CREATE TRIGGER meeting_program_render_publication_immutable
    BEFORE UPDATE ON public.meeting_program_render
    FOR EACH ROW EXECUTE FUNCTION public.prevent_published_render_publication_mutation();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'meeting_program_render_published_delete_protected') THEN
    CREATE TRIGGER meeting_program_render_published_delete_protected
    BEFORE DELETE ON public.meeting_program_render
    FOR EACH ROW EXECUTE FUNCTION public.prevent_published_render_publication_mutation();
  END IF;
END
$$;

COMMENT ON FUNCTION public.prevent_published_render_publication_mutation() IS
  'Prevents mutation or deletion of publication metadata captured for historical program renders; draft and legacy NULL/NULL rows remain compatible.';
COMMENT ON FUNCTION public.validate_public_program_share_active_render() IS
  'Requires a public share active render to be published and to match the share ward and meeting.';

CREATE INDEX IF NOT EXISTS meeting_program_render_ward_meeting_version_idx
  ON public.meeting_program_render (ward_id, meeting_id, version DESC);
CREATE INDEX IF NOT EXISTS meeting_program_render_ward_published_at_idx
  ON public.meeting_program_render (ward_id, meeting_id, published_at DESC NULLS LAST, version DESC);
CREATE INDEX IF NOT EXISTS public_program_share_ward_active_render_idx
  ON public.public_program_share (ward_id, active_render_id);
CREATE INDEX IF NOT EXISTS public_program_share_token_expires_idx
  ON public.public_program_share (token, expires_at);

ALTER TABLE public.meeting_program_render ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_program_render FORCE ROW LEVEL SECURITY;
ALTER TABLE public.public_program_share ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_program_share FORCE ROW LEVEL SECURITY;
