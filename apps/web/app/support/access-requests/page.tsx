import { redirect } from 'next/navigation';

import { auth } from '@/src/auth/auth';
import { hasRole } from '@/src/auth/roles';
import { pool } from '@/src/db/client';

export default async function SupportAccessRequestsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login');
  }

  if (!hasRole(session.user.roles, 'SUPPORT_ADMIN')) {
    redirect('/dashboard');
  }

  const result = await pool.query(
    `SELECT id, name, email, stake, ward, message, created_at
     FROM access_request
     ORDER BY created_at DESC`
  );

  await pool.query(
    `INSERT INTO audit_log (ward_id, user_id, action, details)
     VALUES (NULL, $1, 'SUPPORT_ACCESS_REQUESTS_VIEWED', jsonb_build_object('count', $2::int))`,
    [session.user.id, result.rowCount ?? 0]
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-5 p-6">
      <h1 className="text-2xl font-semibold">Support Console: Access Requests</h1>
      {result.rowCount ? (
        <div className="space-y-3">
          {result.rows.map((row) => (
            <article className="rounded-lg border bg-card p-4 text-card-foreground" key={row.id as string}>
              <p className="font-medium">
                {row.name as string} ({row.email as string})
              </p>
              <p className="text-sm text-muted-foreground">
                {row.stake as string} · {row.ward as string}
              </p>
              <p className="mt-2 text-sm">{row.message as string}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">No access requests yet.</p>
      )}
    </main>
  );
}
