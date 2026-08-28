The Stand supports Gmail for outbound notification email, but configuration happens in deployment environment variables, not app settings UI.

Already present:

Google OAuth login:
AUTH_GOOGLE_ID
AUTH_GOOGLE_SECRET
Email notification channel:
Per-user Email checkboxes in /settings/notifications
SMTP delivery:
Nodemailer already installed
Notification worker already calls SMTP delivery
Delivery status stored in notification_delivery
Gmail deployment configuration:

NOTIFICATION_EMAIL_PROVIDER=smtp
NOTIFICATION_EMAIL_FROM=your-address@gmail.com

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-address@gmail.com
SMTP_PASSWORD=***

Use a Google App Password, not normal Gmail password.

Important distinction:

AUTH_GOOGLE_* = users sign into The Stand with Google.
SMTP_* = The Stand sends notification emails through Gmail.
The current app does not use Gmail API OAuth for sending.
The current app has no admin UI for SMTP credentials. Keep them in server environment variables.
User flow:

User signs in with Google.
Their Google email is stored in user_account.
User enables Email for notification types.
Notification worker sends through Gmail SMTP.
Delivery success/failure is recorded.
So: yes, Gmail works with current app architecture. Need deployment configuration only. Gmail itself is not currently configured in repository or local app environment.
