import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { SiteLogo } from '@/components/site-logo';
import { cn } from '@/lib/utils';
import { getTranslations } from 'next-intl/server';

const sections = [
  [
    'getting-started',
    'Getting started',
    'Sign in, choose your active ward, and begin from the Dashboard. Your available pages and actions depend on your ward role and enabled features.'
  ],
  [
    'dashboard',
    'Dashboard',
    'Use the Dashboard as your follow-up hub. It surfaces the next meeting, drafts, calling and ordinance queues, interviews, leadership actions, notifications, imports, technology readiness, and public portal status.'
  ],
  [
    'meetings',
    'Meetings',
    'Open Meetings to create or review ward meetings. From each meeting you can edit the program, open At the Stand, print the program, and—when authorized—delete the meeting.'
  ],
  [
    'meeting-editor',
    'Meeting editor',
    'Build the program in order, add speakers and topics, manage hymns and announcements, review business items, save notes, publish a public snapshot, and preview the print or public versions.'
  ],
  [
    'at-the-stand',
    'At the Stand',
    'Use At the Stand during the meeting for a readable conducting view. Switch between formal and compact layouts, review business and program items, and use official Church links where provided.'
  ],
  [
    'offline',
    'Offline access',
    'Offline access is automatic after an authorized meeting is opened. If connectivity fails, The Stand shows the newest authorized local snapshot, its age, and pending changes. Private data is scoped to the signed-in user, ward, and meeting.'
  ],
  [
    'business',
    'Ward and stake business',
    'Use the business and membership workspaces to track presentation and follow-up status. The Stand is a coordination layer; it does not replace LCR or other official Church systems.'
  ],
  [
    'leadership',
    'Leadership workspaces',
    'Bishopric, Ward Council, missionary coordination, interviews, and technology checklists keep operational work organized in private, ward-scoped workspaces.'
  ],
  [
    'notifications',
    'Notifications',
    'Manage event subscriptions and delivery preferences in Settings. The notification center shows your in-app notifications; diagnostics are available to authorized administrators.'
  ],
  [
    'imports',
    'Imports and reports',
    'Use the import pages for preview-first membership, calling, and historical program data workflows. Review the preview before committing changes. Reports summarize structured ward data and do not write to Church systems.'
  ],
  [
    'public-programs',
    'Public programs and portals',
    'Publish only the content intended for a public audience. Public links and portals serve published snapshots, not live private meeting data. Republish after changing content that should appear publicly.'
  ],
  [
    'settings',
    'Settings and account',
    'Use Settings for language, appearance, notifications, ward features, public layout, portal configuration, and user access where your role permits. Account pages contain personal preferences and password actions.'
  ],
  [
    'privacy',
    'Privacy and official-system boundaries',
    'Ward and user data is isolated by authorization boundaries. Personal notes remain private, public snapshots are explicit, and The Stand does not read from or write to LCR or other Church systems.'
  ]
] as const;

export default async function ManualPage() {
  const t = await getTranslations('manual');
  const translatedSections = sections.map(([id]) => [id, t(`sectionTitles.${id}`), t(`sectionBodies.${id}`)] as const);
  return (
    <main className="mx-auto w-full max-w-5xl space-y-10 p-6 md:p-10">
      <header className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <SiteLogo className="text-3xl" iconClassName="h-9 w-9" />
          <Link href="/" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            {t('back')}
          </Link>
        </div>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            {t('intro')}
          </p>
          <p className="mt-3 max-w-3xl text-sm text-muted-foreground">{t('helpLinks')}</p>
        </div>
      </header>

      <nav aria-label="Manual sections" className="rounded-lg border bg-card p-5">
        <h2 className="font-semibold">{t('inThis')}</h2>
        <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {translatedSections.map(([id, title]) => (
            <li key={id}>
              <a className="underline underline-offset-4" href={`#${id}`}>
                {title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-5">
        {translatedSections.map(([id, title, body]) => (
          <section id={id} key={id} className="scroll-mt-6 rounded-lg border bg-card p-6">
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="mt-2 leading-7 text-muted-foreground">{body}</p>
          </section>
        ))}
      </div>

      <section className="rounded-lg border bg-card p-6">
        <h2 className="text-xl font-semibold">{t('needHelp')}</h2>
        <p className="mt-2 text-muted-foreground">
          {t('needHelpBody')}
        </p>
        <a
          className="mt-4 inline-block font-medium underline underline-offset-4"
          href="https://github.com/kalebhall/the-stand"
          target="_blank"
          rel="noreferrer"
        >
          {t('github')}
        </a>
      </section>
    </main>
  );
}
