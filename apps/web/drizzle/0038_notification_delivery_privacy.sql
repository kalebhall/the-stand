ALTER TABLE notification_delivery
  DROP CONSTRAINT IF EXISTS notification_delivery_delivery_status_check;

ALTER TABLE notification_delivery
  ADD CONSTRAINT notification_delivery_delivery_status_check
  CHECK (delivery_status = ANY (ARRAY['pending'::text, 'processing'::text, 'success'::text, 'failed'::text, 'suppressed'::text]));

UPDATE notification_delivery d
   SET delivery_status = 'suppressed',
       error_message = 'Suppressed because the event is not public or the recipient is no longer eligible.',
       updated_at = now()
  FROM event_outbox e
 WHERE e.id = d.event_outbox_id
   AND e.ward_id = d.ward_id
   AND d.channel IN ('EMAIL', 'webhook')
   AND d.delivery_status IN ('pending', 'processing', 'failed')
   AND (
     (e.aggregate_type = 'internal_note' AND COALESCE(e.payload->>'visibility', '') <> 'PUBLIC')
     OR (
       d.channel = 'EMAIL'
       AND NOT EXISTS (
         SELECT 1
           FROM ward_user_role wur
           JOIN user_account recipient ON recipient.id = wur.user_id
          WHERE wur.ward_id = d.ward_id
            AND wur.user_id = d.recipient_user_id
            AND recipient.is_active = TRUE
            AND wur.revoked_at IS NULL
            AND (wur.expires_at IS NULL OR wur.expires_at > now())
       )
     )
   );

DROP POLICY IF EXISTS p0_notification_delivery_ward_isolation ON notification_delivery;
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
