import { redirect } from 'next/navigation';

import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canViewCallings } from '@/src/auth/roles';
import { NotificationCenter } from './notification-center';

export default async function NotificationsPage() {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);
  if (!session.activeWardId || !canViewCallings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) redirect('/dashboard');

  return <main className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6"><section className="space-y-2"><h1 className="text-2xl font-semibold tracking-tight">Notifications</h1><p className="text-sm text-muted-foreground">Updates and reminders for your active ward.</p></section><NotificationCenter wardId={session.activeWardId} /></main>;
}
