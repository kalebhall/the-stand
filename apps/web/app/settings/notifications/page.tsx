import { redirect } from 'next/navigation';

import { auth } from '@/src/auth/auth';

export default async function NotificationSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  redirect('/settings');
}
