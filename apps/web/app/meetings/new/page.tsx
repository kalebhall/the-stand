import { redirect } from 'next/navigation';

import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';
import { canManageMeetings } from '@/src/auth/roles';

import { MeetingForm } from '../meeting-form';

export default async function NewMeetingPage() {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);

  if (!session.activeWardId || !canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, session.activeWardId)) {
    redirect('/meetings');
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Create meeting</h1>
        <p className="text-sm text-muted-foreground">Start a new meeting draft and build program items.</p>
      </section>
      <MeetingForm wardId={session.activeWardId} mode="create" />
    </main>
  );
}
