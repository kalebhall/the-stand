import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { auth } from '@/src/auth/auth';

import { LoginForm } from './login-form';

type LoginPageProps = {
  searchParams?: Promise<{ callbackUrl?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const t = await getTranslations('auth');
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
      <h1 className="text-2xl font-semibold">{t('login')}</h1>
      <p className="mt-2 text-muted-foreground">{t('loginDescription')}</p>
      <div className="mt-6">
        <LoginForm callbackUrl={params?.callbackUrl ?? '/dashboard'} />
      </div>
    </main>
  );
}
