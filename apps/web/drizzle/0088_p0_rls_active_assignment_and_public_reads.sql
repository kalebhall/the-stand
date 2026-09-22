-- Strengthen P0 RLS from context-presence checks to active user/ward authorization.
-- Public token reads remain explicitly scoped to the matching token.

CREATE OR REPLACE FUNCTION app.has_active_ward_access(target_ward_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_account ua
      JOIN public.ward_user_role wur ON wur.user_id = ua.id
     WHERE ua.id = app.current_user_id()
       AND ua.is_active = true
       AND wur.user_id = app.current_user_id()
       AND wur.ward_id = target_ward_id
       AND wur.revoked_at IS NULL
       AND (wur.expires_at IS NULL OR wur.expires_at > pg_catalog.now())
  )
$$;

REVOKE ALL ON FUNCTION app.has_active_ward_access(UUID) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stand_user') THEN
    GRANT EXECUTE ON FUNCTION app.has_active_ward_access(UUID) TO stand_user;
  END IF;
END
$$;

ALTER POLICY p0_meeting_ward_isolation ON meeting
  USING (
    ward_id::text = NULLIF(current_setting('app.ward_id', true), '')
    AND app.has_active_ward_access(ward_id)
  )
  WITH CHECK (
    ward_id::text = NULLIF(current_setting('app.ward_id', true), '')
    AND app.has_active_ward_access(ward_id)
  );

ALTER POLICY p0_meeting_program_item_ward_isolation ON meeting_program_item
  USING (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND app.has_active_ward_access(ward_id))
  WITH CHECK (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND app.has_active_ward_access(ward_id));

ALTER POLICY p0_meeting_program_render_ward_isolation ON meeting_program_render
  USING (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND app.has_active_ward_access(ward_id))
  WITH CHECK (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND app.has_active_ward_access(ward_id));

ALTER POLICY p0_meeting_business_line_ward_isolation ON meeting_business_line
  USING (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND app.has_active_ward_access(ward_id))
  WITH CHECK (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND app.has_active_ward_access(ward_id));

ALTER POLICY p0_calling_assignment_ward_isolation ON calling_assignment
  USING (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND app.has_active_ward_access(ward_id))
  WITH CHECK (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND app.has_active_ward_access(ward_id));

ALTER POLICY p0_calling_action_ward_isolation ON calling_action
  USING (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND app.has_active_ward_access(ward_id))
  WITH CHECK (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND app.has_active_ward_access(ward_id));

ALTER POLICY p0_event_outbox_ward_isolation ON event_outbox
  USING (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND app.has_active_ward_access(ward_id))
  WITH CHECK (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND app.has_active_ward_access(ward_id));

ALTER POLICY p0_notification_delivery_ward_isolation ON notification_delivery
  USING (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND app.has_active_ward_access(ward_id))
  WITH CHECK (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND app.has_active_ward_access(ward_id));

ALTER POLICY p0_public_program_share_ward_isolation ON public_program_share
  USING (
    (
      ward_id::text = NULLIF(current_setting('app.ward_id', true), '')
      AND app.has_active_ward_access(ward_id)
    )
    OR token = app.current_public_meeting_token()
    OR EXISTS (
      SELECT 1 FROM public.public_program_portal portal
       WHERE portal.ward_id = public_program_share.ward_id
         AND portal.token = app.current_public_portal_token()
    )
  )
  WITH CHECK (
    ward_id::text = NULLIF(current_setting('app.ward_id', true), '')
    AND app.has_active_ward_access(ward_id)
  );

ALTER POLICY p0_public_program_portal_ward_isolation ON public_program_portal
  USING (
    (
      ward_id::text = NULLIF(current_setting('app.ward_id', true), '')
      AND app.has_active_ward_access(ward_id)
    )
    OR token = app.current_public_portal_token()
  )
  WITH CHECK (
    ward_id::text = NULLIF(current_setting('app.ward_id', true), '')
    AND app.has_active_ward_access(ward_id)
  );

ALTER POLICY p0_announcement_ward_isolation ON announcement
  USING (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND app.has_active_ward_access(ward_id))
  WITH CHECK (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND app.has_active_ward_access(ward_id));

ALTER POLICY p0_calendar_feed_ward_isolation ON calendar_feed
  USING (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND app.has_active_ward_access(ward_id))
  WITH CHECK (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND app.has_active_ward_access(ward_id));

ALTER POLICY p0_calendar_event_cache_ward_isolation ON calendar_event_cache
  USING (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND app.has_active_ward_access(ward_id))
  WITH CHECK (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND app.has_active_ward_access(ward_id));

ALTER POLICY p0_member_ward_isolation ON member
  USING (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND app.has_active_ward_access(ward_id))
  WITH CHECK (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND app.has_active_ward_access(ward_id));

ALTER POLICY p0_member_note_ward_isolation ON member_note
  USING (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND app.has_active_ward_access(ward_id))
  WITH CHECK (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND app.has_active_ward_access(ward_id));

ALTER POLICY p0_import_run_ward_isolation ON import_run
  USING (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND app.has_active_ward_access(ward_id))
  WITH CHECK (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND app.has_active_ward_access(ward_id));

ALTER POLICY p0_ward_stand_template_ward_isolation ON ward_stand_template
  USING (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND app.has_active_ward_access(ward_id))
  WITH CHECK (ward_id::text = NULLIF(current_setting('app.ward_id', true), '') AND app.has_active_ward_access(ward_id));

DROP POLICY IF EXISTS p0_meeting_public_portal_read ON meeting;
CREATE POLICY p0_meeting_public_portal_read ON meeting
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.public_program_portal portal
     WHERE portal.ward_id = meeting.ward_id
       AND portal.token = app.current_public_portal_token()
  )
);

DROP POLICY IF EXISTS p0_meeting_program_render_public_portal_read ON meeting_program_render;
CREATE POLICY p0_meeting_program_render_public_portal_read ON meeting_program_render
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.public_program_portal portal
     WHERE portal.ward_id = meeting_program_render.ward_id
       AND portal.token = app.current_public_portal_token()
  )
);
