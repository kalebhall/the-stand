import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/auth/guards';

export default async function LogoutPage() {
  const session = await requireAuthenticatedSession();
  enforcePasswordRotation(session);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">Logout</h1>
      <p className="mt-2 text-muted-foreground">Logout action placeholder for {session.user.email}.</p>
    </main>
  );
}
