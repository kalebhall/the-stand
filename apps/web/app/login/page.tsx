import { redirect } from 'next/navigation';

import { auth } from '@/src/auth/auth';

import { LoginForm } from './login-form';

type LoginPageProps = {
  searchParams?: Promise<{ callbackUrl?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await auth();

  if (session?.user?.id) {
    if (session.user.mustChangePassword && session.user.hasPassword) {
      redirect('/account/change-password');
    }

    redirect('/dashboard');
  }

  const params = await searchParams;

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">Login</h1>
      <p className="mt-2 text-muted-foreground">Sign in with Google or credentials to continue.</p>
      <div className="mt-6">
        <LoginForm callbackUrl={params?.callbackUrl ?? '/dashboard'} />
      </div>
    </main>
  );
}
