
THE STAND
v1 System Requirements Specification (Bootstrap Support Admin Enabled)

================================
SUPPORT ADMIN BOOTSTRAP (OPTION 1)
================================

On first application startup:

1. If no user exists with global role SUPPORT_ADMIN:
   - The system generates a cryptographically secure random password (minimum 24 characters).
   - The system creates a Support Admin user using SUPPORT_ADMIN_EMAIL (environment variable).
   - The generated password is printed ONE TIME to application startup logs.
   - The password is never stored in plaintext.
   - The user record is created with:
        must_change_password = true

2. On first successful login:
   - The Support Admin is forced to change password.
   - Access to the application is blocked until password change is complete.

3. After password change:
   - must_change_password = false
   - last_password_change_at is recorded.

Security Notes:
- Random password must use a cryptographically secure generator.
- Password must be hashed using Argon2id (preferred) or bcrypt.
- Generated password must never be re-displayed after startup.
- Password login endpoints must be rate-limited.

================================
CORE SYSTEM SUMMARY
================================

Includes:
- Landing page
- Login / Logout
- Request Access
- Dashboard
- Support Admin Console
- Stake/Ward provisioning
- OAuth configuration via UI
- Ward Admin user access management
- Meetings, Stand view, Business workflow
- Public QR portal
- Imports, Announcements, Calendar
- Full RBAC + RLS enforcement

END OF DOCUMENT
