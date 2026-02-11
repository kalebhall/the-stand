import { auth } from '@/src/auth/auth';
import { hasPermission, PERMISSIONS } from '@/src/auth/permissions';

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id || !hasPermission(session, PERMISSIONS.VIEW_DASHBOARD)) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-semibold">Forbidden</h1>
        <p className="mt-2 text-muted-foreground">You do not have permission to view this page.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-2 text-muted-foreground">Role-based dashboard access is enabled for authorized users.</p>
    </main>
  );
}
