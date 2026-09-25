import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { auth } from '@/src/auth/auth';
import { isWardModuleEnabled } from '@/src/modules/service';
import { canViewMeetings } from '@/src/auth/roles';
import { NotificationSubscriptionSettings } from './notification-subscription-settings';

export default async function NotificationSettingsPage() {
  const t = await getTranslations('notifications');
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const wardId = session.activeWardId;
  if (!wardId || !(await isWardModuleEnabled(wardId, session.user.id, 'notifications')) || !canViewMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) redirect('/settings');

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('settingsTitle')}</h1>
        <p className="mt-2 text-muted-foreground">{t('settingsDescription')}</p>
      </div>
      {!wardId ? (
        <p role="alert">{t('selectActiveWard')}</p>
      ) : (
        <NotificationSubscriptionSettings wardId={wardId} hasUsableEmail={Boolean(session.user.email?.trim())} />
      )}
    </main>
  );
}
