-- Harden reusable-block mutation invariants after the initial library migration.
CREATE OR REPLACE FUNCTION app.prevent_reusable_block_scope_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, app AS $$
BEGIN
  IF NEW.scope_type IS DISTINCT FROM OLD.scope_type
     OR NEW.scope_id IS DISTINCT FROM OLD.scope_id
     OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
     OR NEW.block_type IS DISTINCT FROM OLD.block_type
     OR (NEW.current_version IS DISTINCT FROM OLD.current_version AND pg_trigger_depth() = 0)
     OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
     OR (OLD.status = 'ARCHIVED' AND NEW.status <> OLD.status) THEN
    RAISE EXCEPTION 'Reusable block identity, version, type, and archive fields are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
