import Link from 'next/link';

import { ChangePasswordForm } from '@/app/account/change-password/change-password-form';
import { ThemeToggle } from '@/app/account/preferences/theme-toggle';
import { LanguagePreference } from '@/app/settings/language-preference';
import { NotificationTimezoneSetting } from '@/app/settings/notification-timezone';
import { getLocale } from 'next-intl/server';
import { resolveLocale } from '@/src/i18n/config';
import { requireAuthenticatedSession } from '@/src/auth/guards';
import { canManageMeetings, canRunImports, hasRole } from '@/src/auth/roles';
import { getWardModuleSettings } from '@/src/modules/service';
import { ModuleSettings } from '@/app/settings/module-settings';

export default async function SettingsPage() {
  const session = await requireAuthenticatedSession();
  const wardId = session.activeWardId;
  const locale = resolveLocale(await getLocale());
  const isStandAdmin = hasRole(session.user.roles, 'STAND_ADMIN');
  const canManageNotifications =
    Boolean(wardId) &&
    (isStandAdmin ||
      ['BISHOPRIC_EDITOR', 'CLERK_EDITOR', 'WARD_CLERK', 'MEMBERSHIP_CLERK', 'CONDUCTOR_VIEW'].some((role) =>
        hasRole(session.user.roles, role)
      ));
  const canViewActivityLog = wardId ? canRunImports({ roles: session.user.roles, activeWardId: wardId }, wardId) : false;
  const canManageProgramLayout = wardId ? canManageMeetings({ roles: session.user.roles, activeWardId: wardId }, wardId) : false;
  const moduleSettings = wardId && isStandAdmin ? await getWardModuleSettings(wardId, session.user.id) : null;

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-2 text-muted-foreground">Manage your preferences, notifications, and ward settings.</p>
      </div>

      <section className="space-y-4 rounded-lg border bg-card p-5">
        <h2 className="border-b pb-2 text-xl font-medium">Language</h2>
        <LanguagePreference currentLocale={locale} />
      </section>

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

      {(isStandAdmin || canManageNotifications) && wardId && (
        <section className="space-y-4 rounded-lg border bg-card p-5">
          <div>
            <h2 className="border-b pb-2 text-xl font-medium">Ward settings</h2>
            <p className="mt-2 text-sm text-muted-foreground">Manage ward access and program configuration.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {isStandAdmin && <SettingsLink href="/settings/users" label="Ward user management" />}
            {isStandAdmin && <SettingsLink href="/settings/stand-script" label="Stand script templates" />}
            {canManageProgramLayout && <SettingsLink href="/settings/public-layout" label="Printed program layout" />}
            {isStandAdmin && <SettingsLink href="/settings/public-portal" label="Public portal" />}
            {canManageNotifications && <SettingsLink href="/settings/notifications" label="Notification settings" />}
            {canViewActivityLog && <SettingsLink href="/settings/audit-log" label="Activity log" />}
          </div>
          {moduleSettings ? (
            <div className="border-t pt-4">
              <h3 className="mb-2 text-lg font-medium">Modules</h3>
              <p className="mb-4 text-sm text-muted-foreground">Turn optional workflows on or off for this ward. Existing data is preserved.</p>
              <ModuleSettings wardId={wardId} initial={moduleSettings} />
            </div>
          ) : null}
          {canManageNotifications && (
            <div className="border-t pt-4">
              <NotificationTimezoneSetting wardId={wardId} />
            </div>
          )}
        </section>
      )}

      {!wardId && <p role="alert">Select an active ward to manage ward settings and notifications.</p>}
    </main>
  );
}

function SettingsLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="rounded-md border p-4 text-sm font-medium hover:bg-accent">
      {label} <span aria-hidden="true">→</span>
    </Link>
  );
}
