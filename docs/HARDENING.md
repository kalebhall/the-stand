
# HARDENING.md — The Stand (Master Production Hardening Guide)

This document defines the complete security hardening, operational stability,
monitoring, resilience, and disaster recovery strategy for running The Stand
on a self-hosted Ubuntu server.

This guide assumes:
- Ubuntu 22.04 / 24.04
- Local PostgreSQL
- Node.js LTS
- Nginx reverse proxy
- systemd service
- Optional Redis

This document is mandatory for production deployments.

=====================================================================
SECTION 1 — SECURITY PHILOSOPHY
=====================================================================

The Stand is a ward-scoped system handling ecclesiastical scheduling data.
It must follow:

1. Defense in depth
2. Least privilege
3. Local-only database exposure
4. Encrypted transport (HTTPS)
5. Strict tenant isolation (RLS)
6. Auditable administrative actions

Security failures must be treated as release blockers.

=====================================================================
SECTION 2 — OPERATING SYSTEM HARDENING
=====================================================================

2.1 Automatic Security Updates

sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure unattended-upgrades

Verify:
/etc/apt/apt.conf.d/50unattended-upgrades

2.2 SSH Hardening

sudo nano /etc/ssh/sshd_config

Set:
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
AllowTcpForwarding no

Restart:
sudo systemctl restart ssh

Use SSH keys only.

2.3 Disable Unused Services

sudo systemctl list-unit-files --type=service
Disable unnecessary services.

=====================================================================
SECTION 3 — FIREWALL & NETWORK SECURITY
=====================================================================

3.1 UFW Minimal Exposure

sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose

Only ports 22, 80, 443 allowed.

3.2 Fail2ban (Brute Force Protection)

sudo apt install -y fail2ban

Create override:

sudo nano /etc/fail2ban/jail.local

[sshd]
enabled = true
maxretry = 5
bantime = 3600

Restart:
sudo systemctl restart fail2ban

Check:
sudo fail2ban-client status

=====================================================================
SECTION 4 — NGINX TLS HARDENING
=====================================================================

Edit:
sudo nano /etc/nginx/nginx.conf

Inside http block:

ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers on;
ssl_session_timeout 1d;
ssl_session_cache shared:SSL:10m;

Add HSTS (after HTTPS enabled):

add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

Reload:

sudo nginx -t
sudo systemctl reload nginx

Validate with SSL Labs.

=====================================================================
SECTION 5 — POSTGRESQL HARDENING
=====================================================================

5.1 Local-Only Listening

postgresql.conf:
listen_addresses = 'localhost'

5.2 Strong Authentication

pg_hba.conf:
Use scram-sha-256 for local connections.

5.3 Disable Remote Access

Ensure no public exposure of port 5432.

5.4 RLS Validation

Run:
\d+ meeting

Confirm:
Row security enabled.

=====================================================================
SECTION 6 — FILE PERMISSIONS
=====================================================================

Verify:

sudo ls -l /opt/the-stand/app/.env

Permissions must be:
-rw-------

Ownership:
the-stand:the-stand

Ensure backups directory:
chmod 700

=====================================================================
SECTION 7 — APPLICATION HARDENING
=====================================================================

7.1 Rate Limiting

Apply to:
- Login
- Password reset
- Public access request

Optional Nginx rate limit:

limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

7.2 Health Endpoint Protection

/health must not expose secrets.
Return minimal status only.

7.3 Strict Error Handling

- No stack traces in production
- Generic error responses

=====================================================================
SECTION 8 — LOG MANAGEMENT
=====================================================================

8.1 systemd Journal Limits

sudo nano /etc/systemd/journald.conf

Set:
SystemMaxUse=500M

Restart:
sudo systemctl restart systemd-journald

8.2 Application Logging

- Structured logs preferred
- Do not log secrets
- Do not log passwords
- Bootstrap password printed once only

=====================================================================
SECTION 9 — BACKUPS & RESTORE STRATEGY
=====================================================================

9.1 Daily Backups (pg_dump)
9.2 14-Day Retention
9.3 Offsite Backup Recommended (rclone or SSH target)

Example rclone:

rclone sync /opt/the-stand/backups remote:the-stand-backups

9.4 Quarterly Restore Test

Procedure:
1. Restore backup to test DB
2. Start app
3. Verify login
4. Verify meeting history

=====================================================================
SECTION 10 — MONITORING
=====================================================================

Recommended Tools:

Option A: Netdata
Option B: Uptime Kuma
Option C: Prometheus + Grafana

Monitor:
- CPU
- RAM
- Disk usage
- PostgreSQL health
- Redis health (if used)
- HTTP uptime
- /health endpoint

=====================================================================
SECTION 11 — DISASTER RECOVERY
=====================================================================

Recovery Plan:

If server fails:
1. Provision new Ubuntu server
2. Install dependencies (Postgres, Node, Nginx)
3. Restore DB from latest backup
4. Deploy latest code
5. Start service
6. Validate login + meeting history

Maintain:
- Offsite backup copy
- Repository clone access
- Domain DNS access

=====================================================================
SECTION 12 — SECURITY CHECKLIST
=====================================================================

[ ] SSH hardened
[ ] Root login disabled
[ ] Fail2ban active
[ ] Firewall minimal
[ ] TLS 1.2+ only
[ ] HSTS enabled
[ ] PostgreSQL local-only
[ ] RLS verified on all ward tables
[ ] .env secured
[ ] Bootstrap password rotated
[ ] Backups scheduled
[ ] Restore test validated
[ ] Rate limiting active
[ ] Audit logging verified

=====================================================================
SECTION 13 — INCIDENT RESPONSE GUIDELINES
=====================================================================

If suspected breach:

1. Immediately revoke OAuth secrets
2. Rotate SESSION_SECRET
3. Rotate SUPPORT_ADMIN password
4. Review audit_log for abnormal access
5. Review system logs
6. Restore from last known clean backup if needed

=====================================================================
SECTION 14 — FAILURE RULE
=====================================================================

Deployment must be halted if:

- PostgreSQL exposed publicly
- RLS disabled
- Secrets committed to repo
- HTTPS not enabled
- Backups not configured
- Bootstrap password not rotated

=====================================================================
END OF HARDENING.md
=====================================================================
