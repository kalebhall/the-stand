DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'program_publication_identity_unique') THEN
    ALTER TABLE public.program_publication
      ADD CONSTRAINT program_publication_identity_unique UNIQUE (id, ward_id, program_type, source_type, source_id);
  END IF;
  ALTER TABLE public.program_publication_pointer
    DROP CONSTRAINT IF EXISTS program_publication_pointer_publication_id_fkey;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'program_publication_pointer_identity_fkey') THEN
    ALTER TABLE public.program_publication_pointer
      ADD CONSTRAINT program_publication_pointer_identity_fkey
      FOREIGN KEY (publication_id, ward_id, program_type, source_type, source_id)
      REFERENCES public.program_publication(id, ward_id, program_type, source_type, source_id)
      ON DELETE RESTRICT;
  END IF;
END
$$;
