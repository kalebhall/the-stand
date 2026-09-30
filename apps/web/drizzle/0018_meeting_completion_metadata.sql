ALTER TABLE public.meeting
  ADD COLUMN completed_at TIMESTAMPTZ,
  ADD COLUMN completed_by_user_id UUID REFERENCES public.user_account(id) ON DELETE SET NULL;

CREATE INDEX meeting_completed_at_idx ON public.meeting (ward_id, completed_at);
