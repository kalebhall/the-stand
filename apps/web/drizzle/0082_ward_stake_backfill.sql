-- Repair databases created from the pre-stake ward schema.
-- A legacy ward row is unambiguous only when exactly one stake exists.
-- Refuse to guess in a multi-stake database; an operator must map wards first.
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
    SELECT 1
      FROM pg_constraint
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
