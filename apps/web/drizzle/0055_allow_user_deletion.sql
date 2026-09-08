ALTER TABLE internal_note
  ALTER COLUMN created_by_user_id DROP NOT NULL;
ALTER TABLE internal_note
  DROP CONSTRAINT IF EXISTS internal_note_created_by_user_id_fkey;
ALTER TABLE internal_note
  ADD CONSTRAINT internal_note_created_by_user_id_fkey
  FOREIGN KEY (created_by_user_id) REFERENCES user_account(id) ON DELETE SET NULL;

ALTER TABLE bishopric_meeting
  ALTER COLUMN created_by_user_id DROP NOT NULL;
ALTER TABLE bishopric_meeting
  DROP CONSTRAINT IF EXISTS bishopric_meeting_created_by_user_id_fkey;
ALTER TABLE bishopric_meeting
  ADD CONSTRAINT bishopric_meeting_created_by_user_id_fkey
  FOREIGN KEY (created_by_user_id) REFERENCES user_account(id) ON DELETE SET NULL;

ALTER TABLE scheduled_interview
  ALTER COLUMN created_by_user_id DROP NOT NULL;
ALTER TABLE scheduled_interview
  DROP CONSTRAINT IF EXISTS scheduled_interview_created_by_user_id_fkey;
ALTER TABLE scheduled_interview
  ADD CONSTRAINT scheduled_interview_created_by_user_id_fkey
  FOREIGN KEY (created_by_user_id) REFERENCES user_account(id) ON DELETE SET NULL;

ALTER TABLE interview_calendar_subscription
  ALTER COLUMN created_by_user_id DROP NOT NULL;
ALTER TABLE interview_calendar_subscription
  DROP CONSTRAINT IF EXISTS interview_calendar_subscription_created_by_user_id_fkey;
ALTER TABLE interview_calendar_subscription
  ADD CONSTRAINT interview_calendar_subscription_created_by_user_id_fkey
  FOREIGN KEY (created_by_user_id) REFERENCES user_account(id) ON DELETE SET NULL;
