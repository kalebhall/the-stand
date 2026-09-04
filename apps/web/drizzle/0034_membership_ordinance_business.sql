CREATE TABLE IF NOT EXISTS meeting_membership_ordinance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES ward(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES meeting(id) ON DELETE CASCADE,
  member_name TEXT NOT NULL,
  action_type TEXT NOT NULL,
  reason TEXT,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  announced_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  completed_by_user_id UUID REFERENCES user_account(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT meeting_membership_ordinance_action_type_check CHECK (action_type IN ('WELCOME_NEW_MEMBER', 'BABY_BLESSING', 'PRIESTHOOD_ORDINATION', 'PRIESTHOOD_ADVANCEMENT')),
  CONSTRAINT meeting_membership_ordinance_status_check CHECK (status IN ('pending', 'announced', 'action_needed', 'completed'))
);

CREATE INDEX IF NOT EXISTS meeting_membership_ordinance_meeting_idx
  ON meeting_membership_ordinance (ward_id, meeting_id, created_at);

ALTER TABLE ward_stand_template
  ADD COLUMN IF NOT EXISTS welcome_new_member_template TEXT NOT NULL DEFAULT 'After a few words of introduction, we welcome **{memberName}** into the ward by the uplifted hand.';

ALTER TABLE ward_stand_template
  ADD COLUMN IF NOT EXISTS baby_blessing_template TEXT NOT NULL DEFAULT 'The person acting as voice addresses Heavenly Father as in prayer, gives the child a name, addresses the child, gives a blessing as guided by the Spirit, and closes in the name of Jesus Christ.';

ALTER TABLE ward_stand_template
  ADD COLUMN IF NOT EXISTS priesthood_ordination_template TEXT NOT NULL DEFAULT '**{memberName}** will be ordained to the office of **{callingName}**. The ordinance is performed by the authority and according to the required elements in General Handbook 18.10.5.';

ALTER TABLE ward_stand_template
  ADD COLUMN IF NOT EXISTS priesthood_advancement_template TEXT NOT NULL DEFAULT '**{memberName}** will be ordained to the office of **{callingName}**. The ordinance is performed by the authority and according to the required elements in General Handbook 18.10.5.';
