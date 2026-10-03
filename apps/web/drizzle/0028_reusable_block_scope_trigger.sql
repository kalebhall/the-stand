-- Restore the immutable reusable-block identity trigger after mutation hardening.
-- The function is defined by 0026; this migration ensures the trigger is present
-- on databases that applied the initial function before trigger registration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.reusable_block'::regclass
      AND tgname = 'reusable_block_scope_immutable'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER reusable_block_scope_immutable
    BEFORE UPDATE ON public.reusable_block
    FOR EACH ROW EXECUTE FUNCTION app.prevent_reusable_block_scope_mutation();
  END IF;
END;
$$;
