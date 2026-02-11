
# SCHEMA.md

## user_account additions

- password_hash (text nullable)
- must_change_password (boolean not null default false)
- last_password_change_at (timestamptz nullable)

Bootstrap rule:
If no SUPPORT_ADMIN exists at startup, create one with:
- random generated password
- must_change_password = true

Password never stored in plaintext.
