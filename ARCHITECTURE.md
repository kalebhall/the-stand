
# ARCHITECTURE.md

Support Admin Bootstrap (Option 1):

- Runs at application startup.
- Checks for existing SUPPORT_ADMIN.
- If none exists:
    - Generate 24+ character random password using secure RNG.
    - Hash password (Argon2id preferred).
    - Print password to startup logs once.
    - Set must_change_password = true.

No plaintext password is stored.
