
# API.md

## Bootstrap Behavior

Executed at application startup, not via API.

## Auth Endpoints

POST /api/account/change-password
- Requires authentication
- If must_change_password = true, redirect enforced until completed

Password endpoints must be rate limited.
