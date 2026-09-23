-- Milestone 9: template distribution, lineage, tenancy, and lock contracts.
-- Legacy databases may reach this migration before 0082. Repair ward.stake_id
-- before PostgreSQL parses the stake-aware RLS policies below.
ALTER TABLE public.ward ADD COLUMN IF NOT EXISTS stake_id UUID;

DO $$
DECLARE
  stake_count INTEGER;
  unassigned_count INTEGER;
BEGIN
  SELECT count(*) INTO stake_count FROM public.stake;
  SELECT count(*) INTO unassigned_count FROM public.ward WHERE stake_id IS NULL;

  IF unassigned_count > 0 AND stake_count = 1 THEN
    UPDATE public.ward
       SET stake_id = (SELECT id FROM public.stake LIMIT 1)
     WHERE stake_id IS NULL;
  ELSIF unassigned_count > 0 AND stake_count <> 1 THEN
    RAISE EXCEPTION
      'Cannot backfill ward.stake_id safely: % unassigned wards and % stakes exist; map wards explicitly first',
      unassigned_count,
      stake_count;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.ward'::regclass
       AND conname = 'ward_stake_id_fkey'
  ) THEN
    ALTER TABLE public.ward
      ADD CONSTRAINT ward_stake_id_fkey
      FOREIGN KEY (stake_id) REFERENCES public.stake(id) ON DELETE CASCADE;
  END IF;
END
$$;

ALTER TABLE public.ward ALTER COLUMN stake_id SET NOT NULL;

ALTER TABLE public.document_template
  ADD COLUMN IF NOT EXISTS distribution_policy TEXT NOT NULL DEFAULT 'DUPLICATE_AND_CUSTOMIZE',
  ADD COLUMN IF NOT EXISTS source_template_id UUID,
  ADD COLUMN IF NOT EXISTS source_template_version INTEGER,
  ADD COLUMN IF NOT EXISTS published_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

UPDATE public.document_template
   SET distribution_policy = 'DUPLICATE_AND_CUSTOMIZE'
 WHERE distribution_policy IS NULL;
UPDATE public.document_template
   SET published_at = COALESCE(updated_at, created_at, now()),
       published_by_user_id = created_by_user_id
 WHERE status = 'PUBLISHED' AND published_at IS NULL;
ALTER TABLE public.document_template ALTER COLUMN distribution_policy SET DEFAULT 'DUPLICATE_AND_CUSTOMIZE';
ALTER TABLE public.document_template ALTER COLUMN distribution_policy SET NOT NULL;

ALTER TABLE public.document_template_version
  ADD COLUMN IF NOT EXISTS lock_json JSONB NOT NULL DEFAULT '{}'::jsonb;
UPDATE public.document_template_version SET lock_json = '{}'::jsonb WHERE lock_json IS NULL;
ALTER TABLE public.document_template_version ALTER COLUMN lock_json SET DEFAULT '{}'::jsonb;
ALTER TABLE public.document_template_version ALTER COLUMN lock_json SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_template_distribution_policy_check') THEN
    ALTER TABLE public.document_template ADD CONSTRAINT document_template_distribution_policy_check
      CHECK (distribution_policy IN ('USE_AS_IS', 'DUPLICATE_AND_CUSTOMIZE', 'REQUIRED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_template_source_fk') THEN
    ALTER TABLE public.document_template ADD CONSTRAINT document_template_source_fk
      FOREIGN KEY (source_template_id, source_template_version)
      REFERENCES public.document_template_version(template_id, version) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_template_published_by_user_id_fkey') THEN
    ALTER TABLE public.document_template ADD CONSTRAINT document_template_published_by_user_id_fkey
      FOREIGN KEY (published_by_user_id) REFERENCES public.user_account(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_template_scope_tenancy_check') THEN
    ALTER TABLE public.document_template ADD CONSTRAINT document_template_scope_tenancy_check CHECK (
      (scope_type = 'SYSTEM' AND scope_id IS NULL AND created_by_user_id IS NULL) OR
      (scope_type IN ('STAKE', 'WARD', 'PERSONAL_DRAFT') AND scope_id IS NOT NULL)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_template_lineage_check') THEN
    ALTER TABLE public.document_template ADD CONSTRAINT document_template_lineage_check
      CHECK (source_template_id IS NULL OR source_template_id <> id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_template_source_pair_check') THEN
    ALTER TABLE public.document_template ADD CONSTRAINT document_template_source_pair_check
      CHECK ((source_template_id IS NULL AND source_template_version IS NULL) OR
             (source_template_id IS NOT NULL AND source_template_version IS NOT NULL AND source_template_version > 0));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_template_publication_consistency_check') THEN
    ALTER TABLE public.document_template ADD CONSTRAINT document_template_publication_consistency_check
      CHECK (status <> 'PUBLISHED' OR
             (published_at IS NOT NULL AND current_published_version_id IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_template_version_lock_json_shape') THEN
    ALTER TABLE public.document_template_version ADD CONSTRAINT document_template_version_lock_json_shape
      CHECK (jsonb_typeof(lock_json) = 'object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_template_version_version_positive') THEN
    ALTER TABLE public.document_template_version ADD CONSTRAINT document_template_version_version_positive CHECK (version > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_template_version_schema_version_positive') THEN
    ALTER TABLE public.document_template_version ADD CONSTRAINT document_template_version_schema_version_positive CHECK (schema_version > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_template_version_id_template_unique') THEN
    ALTER TABLE public.document_template_version ADD CONSTRAINT document_template_version_id_template_unique UNIQUE (id, template_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_template_current_published_version_fk') THEN
    ALTER TABLE public.document_template ADD CONSTRAINT document_template_current_published_version_fk
      FOREIGN KEY (current_published_version_id, id)
      REFERENCES public.document_template_version(id, template_id) ON DELETE SET NULL;
  END IF;
END $$;

-- A foreign key proves that the source/version pair exists. This trigger adds
-- the cross-row lineage invariant: a source must be a published template and
-- the source version must belong to that template.
CREATE OR REPLACE FUNCTION app.validate_document_template_lineage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, app
AS $$
BEGIN
  IF NEW.source_template_id IS NULL THEN
    IF NEW.source_template_version IS NOT NULL THEN
      RAISE EXCEPTION 'source template version requires a source template' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.source_template_id = NEW.id THEN
    RAISE EXCEPTION 'template cannot be its own source' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.document_template source_template
    WHERE source_template.id = NEW.source_template_id
      AND source_template.status = 'PUBLISHED'
      AND source_template.current_published_version_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'source template must be published' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.document_template_version source_version
    WHERE source_version.template_id = NEW.source_template_id
      AND source_version.version = NEW.source_template_version
  ) THEN
    RAISE EXCEPTION 'source template version does not belong to source template' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS document_template_lineage_validate ON public.document_template;
CREATE TRIGGER document_template_lineage_validate
BEFORE INSERT OR UPDATE OF source_template_id, source_template_version ON public.document_template
FOR EACH ROW EXECUTE FUNCTION app.validate_document_template_lineage();

CREATE OR REPLACE FUNCTION app.validate_document_template_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app
AS $$
BEGIN
  IF NEW.scope_type = 'SYSTEM' THEN
    IF NEW.scope_id IS NOT NULL OR NEW.created_by_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'SYSTEM templates cannot have an owner scope';
    END IF;
  ELSIF NEW.scope_type = 'STAKE' THEN
    IF NOT EXISTS (SELECT 1 FROM public.stake s WHERE s.id = NEW.scope_id) THEN
      RAISE EXCEPTION 'STAKE template scope must reference a stake';
    END IF;
  ELSIF NEW.scope_type IN ('WARD', 'PERSONAL_DRAFT') THEN
    IF NOT EXISTS (SELECT 1 FROM public.ward w WHERE w.id = NEW.scope_id) THEN
      RAISE EXCEPTION 'WARD template scope must reference a ward';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported template scope';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS document_template_scope_validate ON public.document_template;
CREATE TRIGGER document_template_scope_validate
BEFORE INSERT OR UPDATE OF scope_type, scope_id, created_by_user_id ON public.document_template
FOR EACH ROW EXECUTE FUNCTION app.validate_document_template_scope();

CREATE OR REPLACE FUNCTION app.prevent_published_template_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.document_template t
     WHERE t.id = COALESCE(OLD.template_id, NEW.template_id)
       AND t.status = 'PUBLISHED'
  ) THEN
    RAISE EXCEPTION 'Published template versions are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS document_template_version_published_immutable ON public.document_template_version;
CREATE TRIGGER document_template_version_published_immutable
BEFORE UPDATE OR DELETE ON public.document_template_version
FOR EACH ROW EXECUTE FUNCTION app.prevent_published_template_version_mutation();

CREATE INDEX IF NOT EXISTS document_template_source_idx ON public.document_template (source_template_id, source_template_version);
CREATE INDEX IF NOT EXISTS document_template_published_idx ON public.document_template (scope_type, scope_id, published_at);
CREATE INDEX IF NOT EXISTS document_template_version_source_idx ON public.document_template_version (template_id, version);

ALTER TABLE public.document_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_template FORCE ROW LEVEL SECURITY;
ALTER TABLE public.document_template_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_template_version FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_template_read ON public.document_template;
-- Published stake templates are readable by wards in the same stake: scope_type = 'STAKE' AND status = 'PUBLISHED'.
CREATE POLICY document_template_read ON public.document_template FOR SELECT USING (
  (scope_type = 'SYSTEM' AND status = 'PUBLISHED') OR
  app.can_administer_system_templates() OR
  (scope_type = 'STAKE' AND (app.is_stake_admin(scope_id) OR (status = 'PUBLISHED' AND EXISTS (
    SELECT 1 FROM public.ward w WHERE w.id = app.current_ward_id() AND w.stake_id = document_template.scope_id
  )))) OR
  (scope_type = 'WARD' AND scope_id = app.current_ward_id()) OR
  (scope_type = 'PERSONAL_DRAFT' AND scope_id = app.current_ward_id() AND created_by_user_id = app.current_user_id())
);
DROP POLICY IF EXISTS document_template_write ON public.document_template;
CREATE POLICY document_template_write ON public.document_template FOR ALL USING (
  (scope_type = 'STAKE' AND app.is_stake_admin(scope_id)) OR
  (scope_type = 'SYSTEM' AND app.can_administer_system_templates()) OR
  (scope_type = 'WARD' AND scope_id = app.current_ward_id()) OR
  (scope_type = 'PERSONAL_DRAFT' AND scope_id = app.current_ward_id() AND created_by_user_id = app.current_user_id())
) WITH CHECK (
  (scope_type = 'SYSTEM' AND app.can_administer_system_templates()) OR
  (scope_type = 'STAKE' AND app.is_stake_admin(scope_id)) OR
  (scope_type = 'WARD' AND scope_id = app.current_ward_id()) OR
  (scope_type = 'PERSONAL_DRAFT' AND scope_id = app.current_ward_id() AND created_by_user_id = app.current_user_id())
);

DROP POLICY IF EXISTS document_template_version_read ON public.document_template_version;
CREATE POLICY document_template_version_read ON public.document_template_version FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.document_template t
   WHERE t.id = template_id AND (
     app.can_administer_system_templates() OR
     (t.scope_type = 'SYSTEM' AND t.status = 'PUBLISHED') OR
     (t.scope_type = 'STAKE' AND (app.is_stake_admin(t.scope_id) OR (t.status = 'PUBLISHED' AND EXISTS (SELECT 1 FROM public.ward w WHERE w.id = app.current_ward_id() AND w.stake_id = t.scope_id)))) OR
     (t.scope_type = 'WARD' AND t.scope_id = app.current_ward_id()) OR
     (t.scope_type = 'PERSONAL_DRAFT' AND t.scope_id = app.current_ward_id() AND t.created_by_user_id = app.current_user_id())
   ))
);
DROP POLICY IF EXISTS document_template_version_write ON public.document_template_version;
CREATE POLICY document_template_version_write ON public.document_template_version FOR ALL USING (
  EXISTS (SELECT 1 FROM public.document_template t WHERE t.id = template_id AND (
    (t.scope_type = 'SYSTEM' AND app.can_administer_system_templates()) OR
    (t.scope_type = 'STAKE' AND app.is_stake_admin(t.scope_id)) OR
    (t.scope_type = 'WARD' AND t.scope_id = app.current_ward_id()) OR
    (t.scope_type = 'PERSONAL_DRAFT' AND t.scope_id = app.current_ward_id() AND t.created_by_user_id = app.current_user_id())
  ))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.document_template t WHERE t.id = template_id AND (
    (t.scope_type = 'SYSTEM' AND app.can_administer_system_templates()) OR
    (t.scope_type = 'STAKE' AND app.is_stake_admin(t.scope_id)) OR
    (t.scope_type = 'WARD' AND t.scope_id = app.current_ward_id()) OR
    (t.scope_type = 'PERSONAL_DRAFT' AND t.scope_id = app.current_ward_id() AND t.created_by_user_id = app.current_user_id())
  ))
);
