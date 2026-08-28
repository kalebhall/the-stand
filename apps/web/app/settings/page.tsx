import Link from 'next/link';

import { ChangePasswordForm } from '@/app/account/change-password/change-password-form';
import { ThemeToggle } from '@/app/account/preferences/theme-toggle';
import { NotificationSubscriptionSettings } from './notifications/notification-subscription-settings';
import { requireAuthenticatedSession } from '@/src/auth/guards';
import { canRunImports, hasRole } from '@/src/auth/roles';

export default async function SettingsPage() {
  const session = await requireAuthenticatedSession();
  const wardId = session.activeWardId;
  const isStandAdmin = hasRole(session.user.roles, 'STAND_ADMIN');
  const canManageNotifications = Boolean(wardId) && (
    isStandAdmin ||
    ['BISHOPRIC_EDITOR', 'CLERK_EDITOR', 'WARD_CLERK', 'MEMBERSHIP_CLERK', 'CONDUCTOR_VIEW']
      .some((role) => hasRole(session.user.roles, role))
  );
  const canViewActivityLog = wardId
    ? canRunImports({ roles: session.user.roles, activeWardId: wardId }, wardId)
    : false;

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-2 text-muted-foreground">Manage your preferences, notifications, and ward settings.</p>
      </div>

      <section className="space-y-4 rounded-lg border bg-card p-5">
        <h2 className="border-b pb-2 text-xl font-medium">Appearance</h2>
        <div className="flex items-center justify-between gap-4">
          <span>Theme preference</span>
          <ThemeToggle />
        </div>
      </section>

      {session.user.hasPassword && (
        <section className="space-y-4 rounded-lg border bg-card p-5">
          <h2 className="border-b pb-2 text-xl font-medium">Security</h2>
          <div className="pt-2">
            <h3 className="mb-4 text-lg font-medium">Change password</h3>
            <ChangePasswordForm />
          </div>
        </section>
      )}

      {canManageNotifications && wardId && (
        <section className="space-y-4 rounded-lg border bg-card p-5">
          <div>
            <h2 className="border-b pb-2 text-xl font-medium">Notifications</h2>
            <p className="mt-2 text-sm text-muted-foreground">Choose which ward updates appear in the app or are sent by email.</p>
          </div>
          <NotificationSubscriptionSettings wardId={wardId} hasUsableEmail={Boolean(session.user.email?.trim())} />
        </section>
      )}

      {isStandAdmin && wardId && (
        <section className="space-y-4 rounded-lg border bg-card p-5">
          <div>
            <h2 className="border-b pb-2 text-xl font-medium">Ward settings</h2>
            <p className="mt-2 text-sm text-muted-foreground">Manage ward access and program configuration.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SettingsLink href="/settings/users" label="Ward user management" />
            <SettingsLink href="/settings/stand-script" label="Stand script templates" />
            <SettingsLink href="/settings/public-portal" label="Public portal" />
            {canViewActivityLog && <SettingsLink href="/settings/audit-log" label="Activity log" />}
          </div>
        </section>
      )}

      {!wardId && <p role="alert">Select an active ward to manage ward settings and notifications.</p>}
    </main>
  );
}

function SettingsLink({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="rounded-md border p-4 text-sm font-medium hover:bg-accent">{label} <span aria-hidden="true">→</span></Link>;
}