
# INSTALL.md — The Stand (Complete Installation & Deployment Guide)
Version: Master Deployment Specification

This document provides complete step‑by‑step instructions to install,
configure, deploy, secure, maintain, and update The Stand on a self‑hosted
Ubuntu server using a local PostgreSQL database.

Target Environment:
- Ubuntu Server 22.04 LTS or 24.04 LTS
- Local PostgreSQL
- Node.js LTS (20+)
- Nginx reverse proxy
- systemd process management
- HTTPS via Certbot
- Optional Redis (for background jobs)

---------------------------------------------------------------------
SECTION 1 — SERVER PREPARATION
---------------------------------------------------------------------

1.1 Update System
```
sudo apt update
sudo apt -y upgrade
sudo reboot
```
1.2 Install Base Utilities
```
sudo apt install -y git curl ca-certificates build-essential ufw unzip
```
1.3 Configure Firewall (UFW)
```
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```
Only ports 22, 80, and 443 should be open.

---------------------------------------------------------------------
SECTION 2 — INSTALL POSTGRESQL (LOCAL DATABASE)
---------------------------------------------------------------------

2.1 Install
```
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
```
2.2 Secure PostgreSQL

Ensure it listens locally only:
```
sudo nano /etc/postgresql/*/main/postgresql.conf
```
Set:
```
listen_addresses = 'localhost'
```
Restart:
```
sudo systemctl restart postgresql
```
2.3 Create Database and User
```
sudo -u postgres psql
```
```
CREATE USER stand_user WITH PASSWORD 'REPLACE_WITH_STRONG_PASSWORD';
CREATE DATABASE the_stand OWNER stand_user;
\q
```
2.4 Verify Connection
```
psql "postgresql://stand_user:REPLACE_WITH_STRONG_PASSWORD@localhost:5432/the_stand" -c "SELECT now();"
```
---------------------------------------------------------------------
SECTION 3 — INSTALL NODE.JS (LTS)
---------------------------------------------------------------------
```
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```
Optional (if using pnpm):
```
sudo corepack enable
```
---------------------------------------------------------------------
SECTION 4 — OPTIONAL: INSTALL REDIS (FOR JOB QUEUES)
---------------------------------------------------------------------
```
sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
sudo systemctl status redis-server
```
---------------------------------------------------------------------
SECTION 5 — CREATE APPLICATION USER
---------------------------------------------------------------------
```
sudo adduser --system --group --home /opt/the-stand the-stand
sudo mkdir -p /opt/the-stand/app
sudo chown -R the-stand:the-stand /opt/the-stand
```
---------------------------------------------------------------------
SECTION 6 — DEPLOY APPLICATION
---------------------------------------------------------------------

6.1 Clone Repository
```
sudo -u the-stand -H bash -lc "cd /opt/the-stand && git clone https://github.com/kalebhall/the-stand.git app"
```
6.2 Install Dependencies
```
sudo -u the-stand -H bash -lc "cd /opt/the-stand/app && npm install"
```
6.3 Build Production Bundle
```
sudo -u the-stand -H bash -lc "cd /opt/the-stand/app && npm --workspace @the-stand/web run build"
```
---------------------------------------------------------------------
SECTION 7 — CONFIGURE ENVIRONMENT VARIABLES
---------------------------------------------------------------------

Create environment file:
```
sudo -u the-stand -H bash -lc "nano /opt/the-stand/app/.env"
```
Example configuration:
```
NODE_ENV=production
APP_BASE_URL=https://stand.yourdomain.com
PORT=3000

DATABASE_URL=postgresql://stand_user:REPLACE_WITH_STRONG_PASSWORD@localhost:5432/the_stand

SUPPORT_ADMIN_EMAIL=you@example.com

SESSION_SECRET=GENERATE_STRONG_RANDOM_SECRET
AUTH_SECRET=GENERATE_STRONG_RANDOM_SECRET
AUTH_GOOGLE_ID=your_google_client_id
AUTH_GOOGLE_SECRET=your_google_client_secret
PASSWORD_AUTH_ENABLED=true

ENCRYPTION_KEY=GENERATE_32_BYTE_SECRET

REDIS_URL=redis://127.0.0.1:6379

NOTIFICATION_WEBHOOK_URL=http://127.0.0.1:5678/webhook/the-stand
```
Generate secure secret:
```
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Secure the file:
```
sudo chown the-stand:the-stand /opt/the-stand/app/.env
sudo chmod 600 /opt/the-stand/app/.env
```
For this project, the Google OAuth callback route is:
```
/api/auth/callback/google
```

So the full callback URI should be:
```
https://stand.yourdomain.com/api/auth/callback/google
```
(replace with your actual APP_BASE_URL).

---------------------------------------------------------------------
SECTION 8 — RUN DATABASE MIGRATIONS
---------------------------------------------------------------------

Example (Drizzle):
```
sudo -u the-stand -H bash -lc "cd /opt/the-stand/app && npm --workspace @the-stand/web run db:migrate"
```
Confirm:
- All tables created
- RLS enabled on ward tables

---------------------------------------------------------------------
SECTION 9 — SUPPORT ADMIN BOOTSTRAP
---------------------------------------------------------------------

9.1 How the Automatic Bootstrap Works

When `PASSWORD_AUTH_ENABLED=true` and `SUPPORT_ADMIN_EMAIL` is set, the
app automatically creates a SUPPORT_ADMIN account on the first
credentials-related request (not on process startup). If no user with
the SUPPORT_ADMIN role exists:

- A secure random password (≥24 chars) is generated
- The password is hashed with Argon2id and stored in the database
- `must_change_password` is set to `true`
- The plaintext password is printed **once** to stdout

To capture the automatic password, search the service logs:
```
sudo journalctl -u the-stand --no-pager | grep "bootstrap password"
```

If the password is found, log in at `https://stand.yourdomain.com/login`
and you will be prompted to set a new password immediately.

9.2 Manually Setting the Support Admin Password

If the bootstrap password was not captured from the logs (for example,
logs rotated, the service was restarted, or you simply missed it), you
can manually set a new password.

Step 1 — Generate a password hash:
```
cd /opt/the-stand/app && node -e "
const argon2 = require('argon2');
const crypto = require('crypto');
const pw = process.argv[1] || crypto.randomBytes(16).toString('base64url');
argon2.hash(pw, { type: argon2.argon2id, memoryCost: 2**16, timeCost: 3, parallelism: 1 })
  .then(hash => {
    console.log('Password: ' + pw);
    console.log('Hash:     ' + hash);
  });
" 'YOUR_NEW_PASSWORD_HERE'
```

Replace `YOUR_NEW_PASSWORD_HERE` with a strong password (12+ chars).
If you omit it, a random password will be generated for you.

Step 2 — Update the database:
```
sudo -u postgres psql the_stand -c "
  UPDATE user_account
     SET password_hash = 'PASTE_HASH_HERE',
         must_change_password = false
   WHERE email = 'you@example.com';
"
```

Replace `PASTE_HASH_HERE` with the hash from Step 1, and
`you@example.com` with your `SUPPORT_ADMIN_EMAIL` value.

Step 3 — Verify the login works:

Visit `https://stand.yourdomain.com/login` and sign in with your
email and the password you set.

9.3 Resetting a Lost Password (Alternative: Re-bootstrap)

If you prefer to let the app generate a fresh password automatically,
you can remove the SUPPORT_ADMIN role assignment and restart:

```
sudo -u postgres psql the_stand -c "
  DELETE FROM user_global_role
   WHERE role_id = (SELECT id FROM role WHERE name = 'SUPPORT_ADMIN');
"
sudo systemctl restart the-stand
```

Then trigger a new bootstrap by visiting the login page. The app will
detect that no SUPPORT_ADMIN exists and generate a new password. Capture
it from the logs immediately:
```
sudo journalctl -u the-stand -n 50 --no-pager | grep "bootstrap password"
```

---------------------------------------------------------------------
SECTION 10 — CREATE SYSTEMD SERVICE
---------------------------------------------------------------------
```
sudo nano /etc/systemd/system/the-stand.service
```
```
[Unit]
Description=The Stand (Web)
After=network.target postgresql.service

[Service]
Type=simple
User=the-stand
Group=the-stand
WorkingDirectory=/opt/the-stand/app/apps/web
EnvironmentFile=/opt/the-stand/app/.env
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
```
Enable:
```
sudo systemctl daemon-reload
sudo systemctl enable the-stand
sudo systemctl start the-stand
sudo systemctl status the-stand --no-pager
```

10.2 Optional: Background Worker Service (requires Redis)

If using BullMQ for background jobs, create a worker service:
```
sudo nano /etc/systemd/system/the-stand-worker.service
```
```
[Unit]
Description=The Stand (Worker)
After=network.target redis-server.service postgresql.service
Requires=redis-server.service

[Service]
Type=simple
User=the-stand
Group=the-stand
WorkingDirectory=/opt/the-stand/app/apps/web
EnvironmentFile=/opt/the-stand/app/.env
ExecStart=/usr/bin/npm run worker
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
```
Enable:
```
sudo systemctl daemon-reload
sudo systemctl enable the-stand-worker
sudo systemctl start the-stand-worker
sudo systemctl status the-stand-worker --no-pager
```
---------------------------------------------------------------------
SECTION 11 — NGINX REVERSE PROXY
---------------------------------------------------------------------
```
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```
Create config:
```
sudo nano /etc/nginx/sites-available/the-stand
```
```
server {
    listen 80;
    server_name stand.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```
Enable site:
```
sudo ln -s /etc/nginx/sites-available/the-stand /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```
---------------------------------------------------------------------
SECTION 12 — ENABLE HTTPS (CERTBOT)
---------------------------------------------------------------------
```
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d stand.yourdomain.com
sudo certbot renew --dry-run
```
---------------------------------------------------------------------
SECTION 13 — BACKUPS
---------------------------------------------------------------------

Create backup directory:
```
sudo mkdir -p /opt/the-stand/backups
sudo chown postgres:postgres /opt/the-stand/backups
sudo chmod 700 /opt/the-stand/backups
```
Create script:
```
sudo nano /usr/local/bin/the-stand-backup.sh
```
```
#!/usr/bin/env bash
set -euo pipefail
ts=$(date +"%Y%m%d_%H%M%S")
sudo -u postgres pg_dump the_stand | gzip > /opt/the-stand/backups/the_stand_${ts}.sql.gz
find /opt/the-stand/backups -type f -mtime +14 -delete
```
Enable:
```
sudo chmod +x /usr/local/bin/the-stand-backup.sh
sudo crontab -e
```
Add:
```
15 2 * * * /usr/local/bin/the-stand-backup.sh
```

13.2 Restore from Backup

Use the restore script included in the repository (`infra/scripts/restore.sh`):
```
sudo -u the-stand -H bash -lc "/opt/the-stand/app/infra/scripts/restore.sh /opt/the-stand/backups/the_stand_YYYYMMDD_HHMMSS.sql.gz"
```
---------------------------------------------------------------------
SECTION 14 — UPDATES
---------------------------------------------------------------------
```
sudo -u the-stand -H bash -lc "cd /opt/the-stand/app && git pull"
sudo -u the-stand -H bash -lc "cd /opt/the-stand/app && npm install"
sudo -u the-stand -H bash -lc "cd /opt/the-stand/app && npm --workspace @the-stand/web run db:migrate"
sudo -u the-stand -H bash -lc "cd /opt/the-stand/app && npm --workspace @the-stand/web run build"
sudo systemctl restart the-stand
```
---------------------------------------------------------------------
SECTION 15 — HEALTH CHECK
---------------------------------------------------------------------

Verify:
```
curl https://stand.yourdomain.com/health
```
Expected:
```
{
  "status": "ok",
  "db": "connected"
}
```
---------------------------------------------------------------------
SECTION 16 — DISASTER RECOVERY TEST
---------------------------------------------------------------------

Quarterly:

1. Restore latest backup to test database.
2. Start application.
3. Confirm login works.
4. Confirm meeting history intact.

---------------------------------------------------------------------
SECTION 17 — PRODUCTION HARDENING SUMMARY
---------------------------------------------------------------------

Required:

- SSH hardened (no root login)
- Fail2ban enabled
- Firewall minimal ports
- TLS 1.2+ only
- PostgreSQL local-only
- Rate limiting enabled
- Audit logging verified
- Bootstrap password rotated

---------------------------------------------------------------------
FINAL VALIDATION CHECKLIST
---------------------------------------------------------------------

[ ] Application starts via systemd
[ ] HTTPS active
[ ] RLS confirmed enabled
[ ] Support Admin created and rotated password
[ ] Ward created and meeting published
[ ] Public QR portal accessible
[ ] Backups running nightly

---------------------------------------------------------------------
END OF INSTALL.md
---------------------------------------------------------------------
