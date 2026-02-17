-- Allow users to read their own ward_user_role entries during session loading.
--
-- The existing ward_user_role_isolation policy restricts reads to rows matching
-- the current ward context (app.ward_id). During authentication, no ward
-- context is set yet — we need to read ward_user_role to *determine* the
-- user's active ward. This creates a chicken-and-egg problem that causes
-- ward-scoped roles (e.g. BISHOPRIC_EDITOR) to silently fail to load,
-- leaving the session with an empty roles array and null activeWardId.
--
-- This policy allows a user to SELECT their own ward_user_role rows when
-- app.user_id is set, which the auth session loader now does before querying.

DROP POLICY IF EXISTS ward_user_role_self_lookup ON ward_user_role;
CREATE POLICY ward_user_role_self_lookup ON ward_user_role
  FOR SELECT
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
