import { redirect } from 'next/navigation';
import { auth } from '@/src/auth/auth';
import { ChangePasswordForm } from '../change-password/change-password-form';
import { ThemeToggle } from './theme-toggle';

export default async function PreferencesPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login');
  }

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">User Preferences</h1>
        <p className="mt-2 text-muted-foreground">Manage your application settings and appearance.</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-medium border-b pb-2">Appearance</h2>
        <div className="flex items-center justify-between">
          <span>Theme Preference</span>
          <ThemeToggle />
        </div>
      </section>

      {session.user.hasPassword && (
        <section className="space-y-4 pt-4">
          <h2 className="text-xl font-medium border-b pb-2">Security</h2>
          <div className="pt-2">
            <h3 className="text-lg font-medium mb-4">Change Password</h3>
            <ChangePasswordForm />
          </div>
        </section>
      )}
    </main>
  );
}