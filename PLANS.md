
# PLANS.md

Milestone: Bootstrap Support Admin

- Implement startup check for SUPPORT_ADMIN.
- Generate secure random password.
- Hash using Argon2id.
- Print password once to logs.
- Enforce must_change_password on first login.
- Add rate limiting to password endpoints.
