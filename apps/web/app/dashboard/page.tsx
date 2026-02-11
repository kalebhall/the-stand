import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';

export default async function DashboardPage() {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-2 text-muted-foreground">Authenticated as {session.user.email}</p>
    </main>
  );
}
