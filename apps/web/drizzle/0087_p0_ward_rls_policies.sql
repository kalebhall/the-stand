-- P0 ward-isolation repair.
--
-- Earlier migrations enabled RLS on these tables, but their policies delegated
-- context lookup to helper functions. Keep the repair forward-only and bind the
-- policies directly to the transaction-local settings populated by
-- src/db/context.ts. The user setting is required for authenticated ward access;
-- public token policies remain the only unauthenticated read path.

ALTER TABLE meeting ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting FORCE ROW LEVEL SECURITY;
ALTER TABLE meeting_program_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_program_item FORCE ROW LEVEL SECURITY;
ALTER TABLE meeting_program_render ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_program_render FORCE ROW LEVEL SECURITY;
ALTER TABLE meeting_business_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_business_line FORCE ROW LEVEL SECURITY;
ALTER TABLE calling_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE calling_assignment FORCE ROW LEVEL SECURITY;
ALTER TABLE calling_action ENABLE ROW LEVEL SECURITY;
ALTER TABLE calling_action FORCE ROW LEVEL SECURITY;
ALTER TABLE event_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_outbox FORCE ROW LEVEL SECURITY;
ALTER TABLE notification_delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_delivery FORCE ROW LEVEL SECURITY;
ALTER TABLE public_program_share ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_program_share FORCE ROW LEVEL SECURITY;
ALTER TABLE public_program_portal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_program_portal FORCE ROW LEVEL SECURITY;
ALTER TABLE announcement ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement FORCE ROW LEVEL SECURITY;
ALTER TABLE calendar_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_feed FORCE ROW LEVEL SECURITY;
ALTER TABLE calendar_event_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_event_cache FORCE ROW LEVEL SECURITY;
ALTER TABLE member ENABLE ROW LEVEL SECURITY;
ALTER TABLE member FORCE ROW LEVEL SECURITY;
ALTER TABLE member_note ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_note FORCE ROW LEVEL SECURITY;
ALTER TABLE import_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_run FORCE ROW LEVEL SECURITY;
ALTER TABLE ward_stand_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE ward_stand_template FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meeting_isolation ON meeting;
DROP POLICY IF EXISTS p0_meeting_ward_isolation ON meeting;
CREATE POLICY p0_meeting_ward_isolation ON meeting
  USING (
    ward_id::text = NULLIF(current_setting('app.ward_id', true), '')
    AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL
  )
  WITH CHECK (
    ward_id::text = NULLIF(current_setting('app.ward_id', true), '')
    AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL
  );

DROP POLICY IF EXISTS meeting_program_item_isolation ON meeting_program_item;
DROP POLICY IF EXISTS p0_meeting_program_item_ward_isolation ON meeting_program_item;
CREATE POLICY p0_meeting_program_item_ward_isolation ON meeting_program_item
  USING (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL)
  WITH CHECK (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL);

DROP POLICY IF EXISTS meeting_program_render_isolation ON meeting_program_render;
DROP POLICY IF EXISTS p0_meeting_program_render_ward_isolation ON meeting_program_render;
CREATE POLICY p0_meeting_program_render_ward_isolation ON meeting_program_render
  USING (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL)
  WITH CHECK (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL);

DROP POLICY IF EXISTS meeting_business_line_isolation ON meeting_business_line;
DROP POLICY IF EXISTS p0_meeting_business_line_ward_isolation ON meeting_business_line;
CREATE POLICY p0_meeting_business_line_ward_isolation ON meeting_business_line
  USING (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL)
  WITH CHECK (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL);

DROP POLICY IF EXISTS calling_assignment_isolation ON calling_assignment;
DROP POLICY IF EXISTS p0_calling_assignment_ward_isolation ON calling_assignment;
CREATE POLICY p0_calling_assignment_ward_isolation ON calling_assignment
  USING (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL)
  WITH CHECK (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL);

DROP POLICY IF EXISTS calling_action_isolation ON calling_action;
DROP POLICY IF EXISTS p0_calling_action_ward_isolation ON calling_action;
CREATE POLICY p0_calling_action_ward_isolation ON calling_action
  USING (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL)
  WITH CHECK (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL);

DROP POLICY IF EXISTS event_outbox_isolation ON event_outbox;
DROP POLICY IF EXISTS p0_event_outbox_ward_isolation ON event_outbox;
CREATE POLICY p0_event_outbox_ward_isolation ON event_outbox
  USING (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL)
  WITH CHECK (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL);

DROP POLICY IF EXISTS notification_delivery_isolation ON notification_delivery;
DROP POLICY IF EXISTS p0_notification_delivery_ward_isolation ON notification_delivery;
CREATE POLICY p0_notification_delivery_ward_isolation ON notification_delivery
  USING (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL)
  WITH CHECK (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL);

DROP POLICY IF EXISTS public_program_share_isolation ON public_program_share;
DROP POLICY IF EXISTS p0_public_program_share_ward_isolation ON public_program_share;
CREATE POLICY p0_public_program_share_ward_isolation ON public_program_share
  USING (
    (
      ward_id::text = NULLIF(current_setting('app.ward_id', true), '')
      AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL
    )
    OR token = app.current_public_meeting_token()
  )
  WITH CHECK (
    ward_id::text = NULLIF(current_setting('app.ward_id', true), '')
    AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL
  );

DROP POLICY IF EXISTS public_program_portal_isolation ON public_program_portal;
DROP POLICY IF EXISTS p0_public_program_portal_ward_isolation ON public_program_portal;
CREATE POLICY p0_public_program_portal_ward_isolation ON public_program_portal
  USING (
    (
      ward_id::text = NULLIF(current_setting('app.ward_id', true), '')
      AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL
    )
    OR token = app.current_public_portal_token()
  )
  WITH CHECK (
    ward_id::text = NULLIF(current_setting('app.ward_id', true), '')
    AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL
  );

DROP POLICY IF EXISTS announcement_isolation ON announcement;
DROP POLICY IF EXISTS p0_announcement_ward_isolation ON announcement;
CREATE POLICY p0_announcement_ward_isolation ON announcement
  USING (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL)
  WITH CHECK (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL);

DROP POLICY IF EXISTS calendar_feed_isolation ON calendar_feed;
DROP POLICY IF EXISTS p0_calendar_feed_ward_isolation ON calendar_feed;
CREATE POLICY p0_calendar_feed_ward_isolation ON calendar_feed
  USING (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL)
  WITH CHECK (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL);

DROP POLICY IF EXISTS calendar_event_cache_isolation ON calendar_event_cache;
DROP POLICY IF EXISTS p0_calendar_event_cache_ward_isolation ON calendar_event_cache;
CREATE POLICY p0_calendar_event_cache_ward_isolation ON calendar_event_cache
  USING (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL)
  WITH CHECK (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL);

DROP POLICY IF EXISTS member_isolation ON member;
DROP POLICY IF EXISTS p0_member_ward_isolation ON member;
CREATE POLICY p0_member_ward_isolation ON member
  USING (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL)
  WITH CHECK (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL);

DROP POLICY IF EXISTS member_note_isolation ON member_note;
DROP POLICY IF EXISTS p0_member_note_ward_isolation ON member_note;
CREATE POLICY p0_member_note_ward_isolation ON member_note
  USING (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL)
  WITH CHECK (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL);

DROP POLICY IF EXISTS import_run_isolation ON import_run;
DROP POLICY IF EXISTS p0_import_run_ward_isolation ON import_run;
CREATE POLICY p0_import_run_ward_isolation ON import_run
  USING (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL)
  WITH CHECK (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL);

DROP POLICY IF EXISTS ward_stand_template_isolation ON ward_stand_template;
DROP POLICY IF EXISTS p0_ward_stand_template_ward_isolation ON ward_stand_template;
CREATE POLICY p0_ward_stand_template_ward_isolation ON ward_stand_template
  USING (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL)
  WITH CHECK (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL);
