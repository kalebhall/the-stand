import Link from 'next/link';
import { redirect } from 'next/navigation';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { auth } from '@/src/auth/auth';
import { hasRole } from '@/src/auth/roles';

const sections = [
  {
    title: 'User Administration',
    description:
      'Review every account in the system, confirm role coverage, and activate or deactivate access when support intervention is needed.',
    href: '/support/users',
    action: 'Manage users'
  },
  {
    title: 'Stake & Ward Provisioning',
    description:
      'Create new stakes and wards, then verify current provisioning records before assigning ward administrators.',
    href: '/support/provisioning',
    action: 'Manage stakes and wards'
  },
  {
    title: 'Access Requests',
    description:
      'Review incoming access requests from leaders and clerks so approved users can be provisioned in the correct ward.',
    href: '/support/access-requests',
    action: 'Review requests'
  },
  {
    title: 'Audit Log',
    description:
      'Review all system activity including successes and failures. Filter and sort entries by action, user, ward, or date range.',
    href: '/support/audit-log',
    action: 'View audit log'
  },
  {
    title: 'Hymn Library',
    description:
      'Manage the global hymn list used in meeting program autocomplete. Add, edit, or deactivate hymns from the standard hymnbook, new hymnbook, and children\'s songbook.',
    href: '/support/hymns',
    action: 'Manage hymns'
  }
] as const;

export default async function SupportConsolePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login');
  }

  if (!hasRole(session.user.roles, 'SUPPORT_ADMIN')) {
    redirect('/dashboard');
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Support Console</h1>
        <p className="text-muted-foreground">
          Centralized administration for support staff. Use the sections below to manage users, provisioning, and intake requests.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sections.map((section) => (
          <article key={section.href} className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
            <h2 className="text-lg font-semibold">{section.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{section.description}</p>
            <Link href={section.href} className={cn(buttonVariants({ className: 'mt-4', size: 'sm', variant: 'outline' }))}>
              {section.action}
            </Link>
          </article>
        ))}
      </section>
    </main>
  );
}
