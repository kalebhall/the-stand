import { redirect } from 'next/navigation';

import { auth } from '@/src/auth/auth';
import { NotificationSubscriptionSettings } from './notification-subscription-settings';

export default async function NotificationSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const wardId = session.activeWardId;
  return (
    <main className="mx-auto max-w-4xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Notification settings</h1>
        <p className="mt-2 text-muted-foreground">Choose which ward updates appear in the app or are sent by email.</p>
      </div>
      {!wardId ? <p role="alert">Select an active ward before managing notification settings.</p> : <NotificationSubscriptionSettings wardId={wardId} hasUsableEmail={Boolean(session.user.email?.trim())} />}
    </main>
  );
}
