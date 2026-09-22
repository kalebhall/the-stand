-- The auth assignment reader must honor FORCE RLS.
-- ward_user_role_self_lookup permits the authenticated user to read their own
-- assignments before an active ward context exists. row_security=off conflicts
-- with FORCE ROW LEVEL SECURITY because the function owner is stand_user.
ALTER FUNCTION app.load_user_ward_access(UUID) SET row_security = on;
