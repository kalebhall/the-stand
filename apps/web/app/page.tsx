import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { auth } from '@/src/auth/auth';
import { cn } from '@/lib/utils';

const features = [
  {
    title: 'Meeting prep and conducting',
    body: 'Prepare sacrament meetings, then use a tablet-friendly stand view during the meeting.'
  },
  {
    title: 'Published snapshots',
    body: 'Share public-safe program snapshots without exposing internal ward-only data.'
  },
  {
    title: 'Clerk workflow support',
    body: 'Track sustainings and set-aparts, then follow up with clear LCR reminder steps.'
  }
];

export default async function Home() {
  const session = await auth();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-10 p-6 md:p-10">
      <section className="space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight">The Stand</h1>
        <p className="max-w-3xl text-muted-foreground">
          A ward-scoped planning and conducting workspace for sacrament meetings and related leadership workflows.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            className={cn(buttonVariants())}
            href={session?.user?.mustChangePassword ? '/account/change-password' : '/login'}
          >
            Log In
          </Link>
          <Link className={cn(buttonVariants({ variant: 'outline' }))} href="/request-access">
            Request Access
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {features.map((feature) => (
          <article className="rounded-lg border bg-card p-5 text-card-foreground" key={feature.title}>
            <h2 className="text-lg font-semibold">{feature.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{feature.body}</p>
          </article>
        ))}
      </section>

      <section className="rounded-lg border bg-card p-6 text-card-foreground">
        <h2 className="text-xl font-semibold">Security at a glance</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Ward data isolation is enforced at API and database layers.</li>
          <li>The Stand does not write to LCR or Church systems.</li>
          <li>Public routes show published snapshot content only.</li>
        </ul>
      </section>
    </main>
  );
}
