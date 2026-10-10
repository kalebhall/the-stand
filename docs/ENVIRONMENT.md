# Environment configuration

This is the reference for operator-configured variables in the repository's `.env.example` and the related optional runtime overrides. The sample file is the canonical template; keep it and this reference in sync when configuration changes.

## Application `.env`

Create `/opt/the-stand/app/.env` from `.env.example`. Replace every placeholder. Do not commit the real file or paste its values into tickets, logs, or chat. Protect it with owner `the-stand:the-stand` and mode `600`.

| Variable                                | Required / default                                 | Purpose and guidance                                                                                                                                                                                                                                         |
| --------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `APP_BASE_URL`                          | Set to the public site origin                      | Base URL used for application-generated links, including notification links. Use the exact scheme and host that users visit; no path or trailing slash.                                                                                                      |
| `NEXTAUTH_URL`                          | Required for production publishing                 | Canonical public origin used for public meeting URLs and related links. Publishing fails closed in production if this is missing. Keep it aligned with `APP_BASE_URL` and `AUTH_URL`.                                                                        |
| `AUTH_URL`                              | Set to the public site origin                      | Auth.js canonical URL. Keep it aligned with `NEXTAUTH_URL`.                                                                                                                                                                                                  |
| `PORT`                                  | `3000`                                             | Local web-server port behind the reverse proxy. Change only when the systemd service and proxy are configured for the same port.                                                                                                                             |
| `DATABASE_URL`                          | Required                                           | PostgreSQL connection string. Treat as a credential; never log or expose it.                                                                                                                                                                                 |
| `SUPPORT_ADMIN_EMAIL`                   | Required for initial bootstrap                     | Exact email for the configured Support Admin bootstrap identity. It does not grant admin rights to arbitrary first-time visitors.                                                                                                                            |
| `SUPPORT_ADMIN_INITIAL_PASSWORD`        | Required when credential bootstrap is enabled      | One-time bootstrap credential. Keep secret, rotate after bootstrap as your operations require, and never include the real value in docs or logs.                                                                                                             |
| `SESSION_SECRET`                        | Required                                           | Secret used to sign/encrypt session cookies. Generate a strong random value; keep it different from `AUTH_SECRET`.                                                                                                                                           |
| `AUTH_SECRET`                           | Required                                           | Auth.js signing/CSRF secret. Generate a strong random value; keep it different from `SESSION_SECRET`.                                                                                                                                                        |
| `AUTH_GOOGLE_ID`                        | Required only when Google OAuth is enabled         | Google OAuth client ID. Configure its authorized callback URI as `https://<public-host>/api/auth/callback/google`.                                                                                                                                           |
| `AUTH_GOOGLE_SECRET`                    | Required only when Google OAuth is enabled         | Google OAuth client secret. Store only in the protected environment file.                                                                                                                                                                                    |
| `PASSWORD_AUTH_ENABLED`                 | `true` in the sample                               | Enables or disables password sign-in. Do not disable until another tested sign-in method and authorized bootstrap path are available.                                                                                                                        |
| `ENCRYPTION_KEY`                        | Required for encrypted secrets at rest             | Exactly 32 bytes / 64 hexadecimal characters; generate with `openssl rand -hex 32`. Protect it and back it up separately from the database. Losing it can make encrypted database values unreadable.                                                         |
| `MEMBER_IDENTITY_SECRET`                | Required for member identity matching              | Long random HMAC secret used to match imported members without storing birthdays. Keep stable across deployments and backups; rotating it changes matching behavior.                                                                                         |
| `REDIS_URL`                             | Optional; sample uses local Redis                  | Redis connection for background jobs and notification queues. Configure Redis and the worker service together.                                                                                                                                               |
| `NOTIFICATION_WEBHOOK_URL`              | Optional; sample points to a local webhook         | Endpoint for the configured notification webhook integration. Use a trusted HTTPS endpoint in production; protect any embedded credentials.                                                                                                                  |
| `NOTIFICATION_EMAIL_PROVIDER`           | `disabled`                                         | `disabled`, `smtp`, or `webhook`. Email delivery remains off unless explicitly configured.                                                                                                                                                                   |
| `NOTIFICATION_EMAIL_FROM`               | Required for email delivery                        | Sender address shown on notification emails. Use a sender authorized by the provider.                                                                                                                                                                        |
| `NOTIFICATION_EMAIL_REPLY_TO`           | Optional                                           | Reply-to address for notification messages.                                                                                                                                                                                                                  |
| `SMTP_HOST`                             | Required when provider is `smtp`                   | SMTP server hostname.                                                                                                                                                                                                                                        |
| `SMTP_PORT`                             | `587` when omitted                                 | SMTP server port. Port 465 typically uses implicit TLS.                                                                                                                                                                                                      |
| `SMTP_SECURE`                           | `false` in the sample                              | Set `true` for implicit TLS (commonly port 465); use the provider's documented transport settings.                                                                                                                                                           |
| `SMTP_USER`                             | Optional, provider-dependent                       | SMTP username. If configured, `SMTP_PASSWORD` supplies the password.                                                                                                                                                                                         |
| `SMTP_PASSWORD`                         | Required when SMTP auth is used                    | SMTP credential. Keep it private and never log it.                                                                                                                                                                                                           |
| `NOTIFICATION_EMAIL_WEBHOOK_URL`        | Optional legacy/advanced email adapter             | Webhook delivery endpoint for email providers that use the adapter. Configure only with a trusted endpoint.                                                                                                                                                  |
| `LOG_LEVEL`                             | `info`                                             | `debug`, `info`, `warn`, or `error`. Use `debug` temporarily; logs must not contain secrets or private church data.                                                                                                                                          |
| `NEXT_PUBLIC_APP_ENV`                   | `production` in the sample                         | Authenticated UI environment label. Set to `development` on the dev/staging site so users can distinguish it. Use `production` or omit the development marker on production. This `NEXT_PUBLIC_` value is embedded at build time; rebuild after changing it. |
| `NEXT_PUBLIC_ADVANCED_DESIGNER_ENABLED` | `true` in the sample                               | Enables the optional Advanced Program Designer UI/routes. `false` hides/disables that surface and leaves core/basic program workflows available. This public value is embedded at build time; rebuild after changing it.                                     |
| `SENTRY_ENABLED`                        | `false`                                            | Enables Sentry monitoring when the package and DSNs are configured. Keep `false` to disable reporting.                                                                                                                                                       |
| `SENTRY_ORG`                            | `kalebhallcom` in the sample                       | Sentry organization used by the build/integration.                                                                                                                                                                                                           |
| `SENTRY_PROJECT`                        | `javascript-nextjs` in the sample                  | Sentry project used by the build/integration.                                                                                                                                                                                                                |
| `SENTRY_DSN`                            | Optional; needed to send server-side Sentry events | Private server-side Sentry DSN. Do not expose it in client bundles or logs.                                                                                                                                                                                  |
| `NEXT_PUBLIC_SENTRY_DSN`                | Optional; needed for browser-side Sentry events    | Public/client Sentry DSN. Only use the DSN intended for browser reporting.                                                                                                                                                                                   |

### Public URL values by environment

Set all public-origin variables to the origin the user opens in that environment:

```dotenv
# Production example
APP_BASE_URL=https://stand.example.org
NEXTAUTH_URL=https://stand.example.org
AUTH_URL=https://stand.example.org

# Development example (only when the dev site is intentionally served over LAN HTTP)
APP_BASE_URL=http://192.0.2.10
NEXTAUTH_URL=http://192.0.2.10
AUTH_URL=http://192.0.2.10
```

Replace these examples with the actual configured hostname and scheme. Do not use the production origin on a separate dev site, or a localhost origin on a server users reach remotely. For HTTPS deployments, use `https://`. If the host, scheme, reverse proxy, or port changes, update all three origins consistently.

### Loading configuration changes

The web and worker systemd services load `/opt/the-stand/app/.env`. After changing server-side values, restart the affected service(s), usually both `the-stand` and `the-stand-worker`. Verify service state and the health endpoint afterward. `NEXT_PUBLIC_*` values are build-time configuration: change them in the deployment/build environment and rebuild/redeploy; restarting an old bundle alone will not change the client-side value.

## Additional operational overrides

These are not all part of the standard web `.env.example`; configure them only for the relevant runner or service. Follow the specific operations guide before enabling them.

| Variable                                                     | Used for                                                                                                                                                                    |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADVANCED_DESIGNER_ENABLED`                                  | Server-side fallback/override for the advanced designer feature flag. Prefer setting the documented `NEXT_PUBLIC_ADVANCED_DESIGNER_ENABLED` consistently for the whole app. |
| `MAINTENANCE_USER_ID`                                        | Explicit active user context for ward-scoped maintenance/reminder jobs using normal RLS. Never replace this with an unrestricted database role or disabled RLS.             |
| `INTERVIEW_REMINDER_HORIZON_HOURS`                           | Bounded look-ahead for the interview reminder runner.                                                                                                                       |
| `TECHNOLOGY_REMINDER_HORIZON_DAYS`                           | Bounded look-ahead for the technology checklist reminder runner.                                                                                                            |
| `RAW_PASTE_RETENTION_DAYS`                                   | Retention override for raw import/paste data; bounded by the runner.                                                                                                        |
| `AUDIT_LOG_RETENTION_DAYS`                                   | Audit retention override; bounded by the retention runner.                                                                                                                  |
| `RETENTION_DRY_RUN`                                          | Set to `1` to report retention counts without deleting data.                                                                                                                |
| `MEDIA_ROOT`                                                 | Filesystem root for private managed media; defaults to the app's `var/media` directory. Ensure the service user can access it and back it up appropriately.                 |
| `BACKUP_DIR`, `BACKUP_MAX_AGE_HOURS`                         | Backup-health monitor path and freshness threshold; configure in its dedicated service environment, not the app `.env` unless specifically required.                        |
| `ENV_FILE`                                                   | Explicit env-file path for the migration runner when its default lookup is not suitable.                                                                                    |
| `TEST_DATABASE_URL`, `E2E_FIXTURES_ALLOWED`, `E2E_TEST_MODE` | Test/E2E-only controls. Use only with a disposable test database; never enable E2E fixture mode against production.                                                         |
| `NEXT_PUBLIC_BUILD_ID`                                       | Deployment-supplied client build identifier used by deployment diagnostics.                                                                                                 |
| `NODE_ENV`, `NEXT_RUNTIME`, `CI`                             | Runtime/CI platform values. Normally managed by the process manager/build system; do not add or override casually in the production `.env`.                                 |

Systemd-only backup and offsite replication variables (for example `RESTIC_REPOSITORY`, `RESTIC_PASSWORD_FILE`, and `RESTIC_CACHE_DIR`) belong in their dedicated protected service environment files. See the backup sections of [INSTALL.md](INSTALL.md); do not copy backup credentials into the web application's `.env`.

## Security checklist

- Keep the real `.env` out of Git; `.env.example` contains placeholders only.
- Set file owner to the service account and permissions to `600`.
- Never print the file or secret values while troubleshooting. Check presence/validity without displaying values.
- Do not copy credentials into documentation. Replace any real credential accidentally found in docs with `[REDACTED]` and rotate it.
- Back up encryption and identity secrets securely; a database backup alone is not sufficient to preserve encrypted data or stable member matching.
