import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/src/auth/auth';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChangePasswordForm } from './change-password/change-password-form';
import { ThemeToggle } from './preferences/theme-toggle';

export default async function AccountPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login');
  }

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account Overview</h1>
        <p className="mt-2 text-muted-foreground">Manage your profile, preferences, and account security.</p>
      </div>

      <section className="space-y-4 rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
        <h2 className="text-lg font-medium border-b pb-2">Profile Information</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between py-1">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{session.user.email}</span>
          </div>
          {session.user.name && (
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Display Name</span>
              <span className="font-medium">{session.user.name}</span>
            </div>
          )}
          <div className="flex justify-between py-1">
            <span className="text-muted-foreground">Assigned Roles</span>
            <span className="font-medium">
              {session.user.roles && session.user.roles.length > 0 ? session.user.roles.join(', ') : 'None'}
            </span>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
        <div className="flex items-center justify-between border-b pb-2">
          <h2 className="text-lg font-medium">Appearance & Preferences</h2>
          <Link href="/settings" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
            Edit Settings &rarr;
          </Link>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Theme Preference</span>
          <ThemeToggle />
        </div>
      </section>

      {session.user.hasPassword && (
        <section className="space-y-4 rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
          <h2 className="text-lg font-medium border-b pb-2">Security</h2>
          <div className="pt-2">
            <h3 className="text-md font-medium mb-4">Change Password</h3>
            <ChangePasswordForm />
          </div>
        </section>
      )}
    </main>
  );
}
