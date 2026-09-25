import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { auth } from '@/src/auth/auth';
import { hasRole } from '@/src/auth/roles';
import { SupportQueueClient } from './queue-client';

export default async function SupportQueuePage() {
  const t = await getTranslations('supportQueue');
  const session = await auth();

  if (!session?.user?.id) redirect('/login');
  if (!hasRole(session.user.roles, 'SUPPORT_ADMIN') && !hasRole(session.user.roles, 'SYSTEM_ADMIN')) redirect('/dashboard');

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
        <Link href="/support" className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}>{t('back')}</Link>
      </section>
      <SupportQueueClient />
    </main>
  );
}
