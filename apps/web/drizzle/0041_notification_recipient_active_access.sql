DROP POLICY IF EXISTS notification_email_digest_item_isolation ON notification_email_digest_item;
DROP POLICY IF EXISTS user_notification_isolation ON user_notification;

CREATE POLICY notification_email_digest_item_isolation
  ON notification_email_digest_item
  USING (
    ward_id = app.current_ward_id()
    AND (
      app.current_user_id() = '00000000-0000-0000-0000-000000000000'::uuid
      OR app.is_support_admin()
      OR app.is_system_admin()
      OR app.has_active_ward_access(ward_id)
    )
    AND (
      app.current_user_id() = '00000000-0000-0000-0000-000000000000'::uuid
      OR app.is_support_admin()
      OR app.is_system_admin()
      OR recipient_user_id = app.current_user_id()
    )
  )
  WITH CHECK (
    ward_id = app.current_ward_id()
    AND (
      app.current_user_id() = '00000000-0000-0000-0000-000000000000'::uuid
      OR app.is_support_admin()
      OR app.is_system_admin()
      OR app.has_active_ward_access(ward_id)
    )
    AND (
      app.current_user_id() = '00000000-0000-0000-0000-000000000000'::uuid
      OR app.is_support_admin()
      OR app.is_system_admin()
      OR recipient_user_id = app.current_user_id()
    )
  );

CREATE POLICY user_notification_isolation
  ON user_notification
  USING (
    ward_id = app.current_ward_id()
    AND (
      app.current_user_id() = '00000000-0000-0000-0000-000000000000'::uuid
      OR app.is_support_admin()
      OR app.is_system_admin()
      OR app.has_active_ward_access(ward_id)
    )
    AND (
      app.current_user_id() = '00000000-0000-0000-0000-000000000000'::uuid
      OR app.is_support_admin()
      OR app.is_system_admin()
      OR recipient_user_id = app.current_user_id()
    )
  )
  WITH CHECK (
    ward_id = app.current_ward_id()
    AND (
      app.current_user_id() = '00000000-0000-0000-0000-000000000000'::uuid
      OR app.is_support_admin()
      OR app.is_system_admin()
      OR app.has_active_ward_access(ward_id)
    )
    AND (
      app.current_user_id() = '00000000-0000-0000-0000-000000000000'::uuid
      OR app.is_support_admin()
      OR app.is_system_admin()
      OR recipient_user_id = app.current_user_id()
    )
  );
