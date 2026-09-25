-- Remove the sacrament-planner meeting history import feature.
-- The table is no longer referenced by any application code.
DROP TABLE IF EXISTS public.historical_import_name_review;
