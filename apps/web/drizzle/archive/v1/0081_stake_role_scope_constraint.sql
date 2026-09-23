-- Allow stake-scoped roles introduced by Milestone 9.
-- Forward-only repair for the original GLOBAL/WARD-only role constraint.
ALTER TABLE public.role DROP CONSTRAINT IF EXISTS role_scope_check;
ALTER TABLE public.role
  ADD CONSTRAINT role_scope_check CHECK (scope IN ('GLOBAL', 'WARD', 'STAKE'));
