ALTER TABLE calling_assignment
  ADD COLUMN IF NOT EXISTS sustained_date DATE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'calling_assignment'
       AND column_name = 'sustained'
  ) THEN
    UPDATE calling_assignment
       SET sustained_date = COALESCE(sustained_date, created_at::date)
     WHERE sustained = TRUE;

    ALTER TABLE calling_assignment
      DROP COLUMN sustained;
  END IF;
END $$;
