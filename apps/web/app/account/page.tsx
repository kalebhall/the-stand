import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/src/auth/auth';
import { getTranslations } from 'next-intl/server';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChangePasswordForm } from './change-password/change-password-form';
import { ThemeToggle } from './preferences/theme-toggle';

export default async function AccountPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login');
  }
  const t = await getTranslations('account');

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-2 text-muted-foreground">{t('description')}</p>
      </div>

      <section className="space-y-4 rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
        <h2 className="text-lg font-medium border-b pb-2">{t('profile')}</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between py-1">
            <span className="text-muted-foreground">{t('email')}</span>
            <span className="font-medium">{session.user.email}</span>
          </div>
          {session.user.name && (
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">{t('displayName')}</span>
              <span className="font-medium">{session.user.name}</span>
            </div>
          )}
          <div className="flex justify-between py-1">
            <span className="text-muted-foreground">{t('assignedRoles')}</span>
            <span className="font-medium">
              {session.user.roles && session.user.roles.length > 0 ? session.user.roles.join(', ') : t('none')}
            </span>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
        <div className="flex items-center justify-between border-b pb-2">
          <h2 className="text-lg font-medium">{t('appearance')}</h2>
          <Link href="/settings" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
            {t('editSettings')}
          </Link>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{t('theme')}</span>
          <ThemeToggle />
        </div>
      </section>

      {session.user.hasPassword && (
        <section className="space-y-4 rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
          <h2 className="text-lg font-medium border-b pb-2">{t('security')}</h2>
          <div className="pt-2">
            <h3 className="text-md font-medium mb-4">{t('changePassword')}</h3>
            <ChangePasswordForm />
          </div>
        </section>
      )}
    </main>
  );
}
