import { requireAuthenticatedSession } from '@/src/auth/guards';

import { LogoutForm } from './logout-form';

export default async function LogoutPage() {
  const session = await requireAuthenticatedSession();

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">Log out</h1>
      <p className="mt-2 text-muted-foreground">
        You are signed in as {session.user.email}.
      </p>
      <div className="mt-6">
        <LogoutForm />
      </div>
    </main>
  );
}
