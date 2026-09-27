CREATE TABLE IF NOT EXISTS public.church_action_follow_up (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES public.ward(id) ON DELETE CASCADE,
  family TEXT NOT NULL,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  member_name TEXT NOT NULL,
  calling_assignment_id UUID REFERENCES public.calling_assignment(id) ON DELETE CASCADE,
  membership_ordinance_id UUID REFERENCES public.meeting_membership_ordinance(id) ON DELETE CASCADE,
  source_event TEXT NOT NULL,
  source_event_id UUID NOT NULL,
  description TEXT NOT NULL,
  official_system TEXT NOT NULL DEFAULT 'LCR',
  official_reference_url TEXT,
  due_date DATE,
  completed_at TIMESTAMPTZ,
  completed_by_user_id UUID REFERENCES public.user_account(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_action_follow_up_family_check
    CHECK (family IN ('CALLING', 'MEMBERSHIP', 'PRIESTHOOD')),
  CONSTRAINT church_action_follow_up_action_type_check
    CHECK (action_type IN (
      'CALLING_RECORDING_REVIEW',
      'CALLING_SUSTAINING_RECORDING',
      'CALLING_SET_APART_RECORDING',
      'CALLING_RELEASE_RECORDING',
      'WELCOME_NEW_MEMBER',
      'RECOGNIZE_BAPTIZED_CHILD',
      'BAPTISM_CONFIRMATION_FOLLOW_UP',
      'ATTENDANCE_LCR_HANDOFF',
      'BABY_BLESSING',
      'PRIESTHOOD_ORDINATION',
      'PRIESTHOOD_ADVANCEMENT'
    )),
  CONSTRAINT church_action_follow_up_status_check
    CHECK (status IN ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'NOT_APPLICABLE')),
  CONSTRAINT church_action_follow_up_official_system_check
    CHECK (official_system IN ('LCR')),
  CONSTRAINT church_action_follow_up_source_check
    CHECK (
      (family = 'CALLING' AND calling_assignment_id IS NOT NULL AND membership_ordinance_id IS NULL)
      OR
      (family IN ('MEMBERSHIP', 'PRIESTHOOD') AND membership_ordinance_id IS NOT NULL AND calling_assignment_id IS NULL)
    ),
  CONSTRAINT church_action_follow_up_source_event_unique
    UNIQUE (ward_id, action_type, source_event_id)
);

CREATE INDEX IF NOT EXISTS church_action_follow_up_queue_idx
  ON public.church_action_follow_up (ward_id, status, due_date, created_at);

CREATE INDEX IF NOT EXISTS church_action_follow_up_calling_idx
  ON public.church_action_follow_up (ward_id, calling_assignment_id, status);

CREATE INDEX IF NOT EXISTS church_action_follow_up_ordinance_idx
  ON public.church_action_follow_up (ward_id, membership_ordinance_id, status);

ALTER TABLE public.church_action_follow_up ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.church_action_follow_up FORCE ROW LEVEL SECURITY;

CREATE POLICY church_action_follow_up_isolation
  ON public.church_action_follow_up
  USING (ward_id = app.current_ward_id())
  WITH CHECK (ward_id = app.current_ward_id());
