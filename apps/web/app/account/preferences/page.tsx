import { redirect } from 'next/navigation';
import { auth } from '@/src/auth/auth';
export default async function PreferencesPage() {
  if (!(await auth())?.user?.id) redirect('/login');
  redirect('/settings');
}