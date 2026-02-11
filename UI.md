
# UI.md

## First Login Flow (Support Admin)

If must_change_password = true:
- Redirect to /account/change-password
- Disable navigation until password updated
- Display security notice explaining first-time setup

After password change:
- Redirect to /dashboard
