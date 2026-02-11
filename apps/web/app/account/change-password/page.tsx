import { redirect } from 'next/navigation';

import { auth } from '@/src/auth/auth';

import { ChangePasswordForm } from './change-password-form';

export default async function ChangePasswordPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login');
  }

  if (!session.user.hasPassword) {
    redirect('/dashboard');
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">Change password</h1>
      <p className="mt-2 text-muted-foreground">
        {session.user.mustChangePassword
          ? 'You must change your password before continuing.'
          : 'Update your password for your account.'}
      </p>
      <ChangePasswordForm />
    </main>
  );
}
