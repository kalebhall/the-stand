DROP POLICY IF EXISTS notification_delivery_isolation ON notification_delivery;

CREATE POLICY notification_delivery_isolation
  ON notification_delivery
  USING (
    ward_id = app.current_ward_id()
    AND app.has_active_ward_access(ward_id)
    AND (
      app.current_user_id() = '00000000-0000-0000-0000-000000000000'::uuid
      OR app.is_support_admin()
      OR app.is_system_admin()
      OR recipient_user_id = app.current_user_id()
      OR EXISTS (
        SELECT 1
          FROM ward_user_role wur
          JOIN role r ON r.id = wur.role_id
         WHERE wur.ward_id = notification_delivery.ward_id
           AND wur.user_id = app.current_user_id()
           AND wur.revoked_at IS NULL
           AND (wur.expires_at IS NULL OR wur.expires_at > now())
           AND r.name IN ('STAND_ADMIN', 'BISHOPRIC_EDITOR', 'CLERK_EDITOR', 'WARD_CLERK', 'MEMBERSHIP_CLERK')
      )
    )
  )
  WITH CHECK (
    ward_id = app.current_ward_id()
    AND app.has_active_ward_access(ward_id)
    AND (
      app.current_user_id() = '00000000-0000-0000-0000-000000000000'::uuid
      OR app.is_support_admin()
      OR app.is_system_admin()
      OR recipient_user_id = app.current_user_id()
      OR EXISTS (
        SELECT 1
          FROM ward_user_role wur
          JOIN role r ON r.id = wur.role_id
         WHERE wur.ward_id = notification_delivery.ward_id
           AND wur.user_id = app.current_user_id()
           AND wur.revoked_at IS NULL
           AND (wur.expires_at IS NULL OR wur.expires_at > now())
           AND r.name IN ('STAND_ADMIN', 'BISHOPRIC_EDITOR', 'CLERK_EDITOR', 'WARD_CLERK', 'MEMBERSHIP_CLERK')
      )
    )
  );
