# Support Admin Login Debug Playbook

Use this when the Support Admin user cannot sign in with email/password.

## 1) Confirm bootstrap prerequisites

The bootstrap user is only created when `SUPPORT_ADMIN_EMAIL` is set and `ensureSupportAdminBootstrap()` runs during auth flow.

```bash
printenv SUPPORT_ADMIN_EMAIL
```

If this is empty, set it and restart the app.

## 2) Check startup/auth logs for one-time bootstrap password

On first bootstrap, the app logs the generated password once:

```text
Support Admin bootstrap password (shown once): <password>
```

If you did not capture it, follow **Step 7 (safe password reset)**.

## 3) Verify the Support Admin account exists and is active

Run in PostgreSQL:

```sql
SELECT
  u.id,
  u.email,
  u.is_active,
  u.must_change_password,
  (u.password_hash IS NOT NULL) AS has_password_hash,
  EXISTS (
    SELECT 1
    FROM user_global_role ugr
    JOIN role r ON r.id = ugr.role_id
    WHERE ugr.user_id = u.id AND r.name = 'SUPPORT_ADMIN'
  ) AS has_support_admin_role
FROM user_account u
WHERE lower(u.email) = lower('<support-admin-email>');
```

Expected:
- `is_active = true`
- `has_password_hash = true`
- `has_support_admin_role = true`

## 4) Verify credentials path is enabled and used

The login form calls NextAuth `signIn('credentials', ...)`, so email/password uses the credentials provider path.

Quick browser checks:
- Use the email/password form (not Google)
- Make sure email matches `SUPPORT_ADMIN_EMAIL` exactly (case-insensitive)

## 5) Check rate limiting

Credentials login is rate-limited by email + IP. Repeated retries can temporarily block attempts.

Debug actions:
- Wait and retry from same client later
- Retry from a different source IP if available
- Restart dev server to clear in-memory limiter state (local/dev only)

## 6) Inspect auth query behavior directly

Verify the row returned by credential lookup:

```sql
SELECT id, email, is_active, (password_hash IS NOT NULL) AS has_password_hash
FROM user_account
WHERE email = lower('<support-admin-email>')
  AND is_active = true;
```

If no row returns, check:
- Email mismatch
- `is_active` accidentally set to false

## 7) Safe password reset (debug/admin recovery)

Generate an Argon2id hash from a known temporary password:

```bash
cd apps/web
node --input-type=module -e "import argon2 from 'argon2'; const password='Temp-Change-Me-Now-123!'; const hash=await argon2.hash(password,{type:argon2.argon2id}); console.log(hash);"
```

Then update the user and force password rotation:

```sql
UPDATE user_account
SET password_hash = '<argon2-hash>',
    must_change_password = true,
    is_active = true
WHERE lower(email) = lower('<support-admin-email>');
```

After login with the temporary password, user should be redirected to change password.

## 8) Optional SQL one-liner to validate role assignment

```sql
SELECT r.name
FROM role r
JOIN user_global_role ugr ON ugr.role_id = r.id
JOIN user_account u ON u.id = ugr.user_id
WHERE lower(u.email) = lower('<support-admin-email>');
```

## 9) Common root causes checklist

- `SUPPORT_ADMIN_EMAIL` missing in runtime environment
- Bootstrap password was generated once but never captured
- Account exists but `is_active = false`
- Account exists without `SUPPORT_ADMIN` role
- Too many login retries triggered rate limit
- Logging into Google provider instead of credentials form
