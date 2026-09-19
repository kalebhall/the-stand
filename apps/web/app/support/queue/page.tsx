import Link from 'next/link';
import { redirect } from 'next/navigation';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { auth } from '@/src/auth/auth';
import { hasRole } from '@/src/auth/roles';
import { SupportQueueClient } from './queue-client';

export default async function SupportQueuePage() {
  const session = await auth();

  if (!session?.user?.id) redirect('/login');
  if (!hasRole(session.user.roles, 'SUPPORT_ADMIN') && !hasRole(session.user.roles, 'SYSTEM_ADMIN')) redirect('/dashboard');

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Support assignment queue</h1>
        <p className="text-sm text-muted-foreground">Claim and coordinate global support work. Queue actions do not grant ward access.</p>
        <Link href="/support" className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}>Back to support console</Link>
      </section>
      <SupportQueueClient />
    </main>
  );
}
