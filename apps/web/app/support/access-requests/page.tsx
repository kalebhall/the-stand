import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { auth } from '@/src/auth/auth';
import { hasRole } from '@/src/auth/roles';
import { pool } from '@/src/db/client';

type AccessRequestRow = {
  id: string;
  name: string;
  email: string;
  stake: string;
  ward: string;
  message: string;
  created_at: string;
};

async function requireSupportAdmin() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login');
  }

  if (!hasRole(session.user.roles, 'SUPPORT_ADMIN')) {
    redirect('/dashboard');
  }

  return session;
}

export default async function SupportAccessRequestsPage() {
  const session = await requireSupportAdmin();

  async function addStake(formData: FormData) {
    'use server';

    const actingSession = await requireSupportAdmin();
    const requestId = String(formData.get('requestId') ?? '');

    if (!requestId) {
      return;
    }

    const request = await pool.query(`SELECT stake FROM access_request WHERE id = $1`, [requestId]);

    if (!request.rowCount) {
      return;
    }

    const stakeName = String(request.rows[0].stake ?? '').trim();

    if (!stakeName) {
      return;
    }

    const existingStake = await pool.query(`SELECT id FROM stake WHERE LOWER(name) = LOWER($1) LIMIT 1`, [stakeName]);
    const stakeId =
      (existingStake.rows[0]?.id as string | undefined) ??
      (
        await pool.query(`INSERT INTO stake (name) VALUES ($1) RETURNING id`, [stakeName])
      ).rows[0].id;

    await pool.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES (NULL, $1, 'SUPPORT_ACCESS_REQUEST_STAKE_IMPORTED', jsonb_build_object('requestId', $2::text, 'stakeId', $3::text, 'stakeName', $4::text))`,
      [actingSession.user.id, requestId, stakeId as string, stakeName]
    );

    revalidatePath('/support/access-requests');
    revalidatePath('/support/provisioning');
  }

  async function addWard(formData: FormData) {
    'use server';

    const actingSession = await requireSupportAdmin();
    const requestId = String(formData.get('requestId') ?? '');

    if (!requestId) {
      return;
    }

    const request = await pool.query(`SELECT stake, ward FROM access_request WHERE id = $1`, [requestId]);

    if (!request.rowCount) {
      return;
    }

    const stakeName = String(request.rows[0].stake ?? '').trim();
    const wardName = String(request.rows[0].ward ?? '').trim();

    if (!stakeName || !wardName) {
      return;
    }

    const existingStake = await pool.query(`SELECT id FROM stake WHERE LOWER(name) = LOWER($1) LIMIT 1`, [stakeName]);
    const stakeId =
      (existingStake.rows[0]?.id as string | undefined) ??
      (
        await pool.query(`INSERT INTO stake (name) VALUES ($1) RETURNING id`, [stakeName])
      ).rows[0].id;

    const existingWard = await pool.query(
      `SELECT id FROM ward WHERE stake_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
      [stakeId, wardName]
    );
    const wardId =
      (existingWard.rows[0]?.id as string | undefined) ??
      (
        await pool.query(`INSERT INTO ward (stake_id, name) VALUES ($1, $2) RETURNING id`, [stakeId, wardName])
      ).rows[0].id;

    await pool.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES (NULL, $1, 'SUPPORT_ACCESS_REQUEST_WARD_IMPORTED', jsonb_build_object('requestId', $2::text, 'stakeId', $3::text, 'wardId', $4::text, 'stakeName', $5::text, 'wardName', $6::text))`,
      [actingSession.user.id, requestId, stakeId as string, wardId as string, stakeName, wardName]
    );

    revalidatePath('/support/access-requests');
    revalidatePath('/support/provisioning');
  }

  async function addUser(formData: FormData) {
    'use server';

    const actingSession = await requireSupportAdmin();
    const requestId = String(formData.get('requestId') ?? '');

    if (!requestId) {
      return;
    }

    const request = await pool.query(`SELECT name, email FROM access_request WHERE id = $1`, [requestId]);

    if (!request.rowCount) {
      return;
    }

    const name = String(request.rows[0].name ?? '').trim();
    const email = String(request.rows[0].email ?? '').trim().toLowerCase();
    const displayName = name.length ? name : null;

    if (!email) {
      return;
    }

    const existingUser = await pool.query(`SELECT id FROM user_account WHERE LOWER(email) = LOWER($1) LIMIT 1`, [email]);
    const userId =
      (existingUser.rows[0]?.id as string | undefined) ??
      (
        await pool.query(`INSERT INTO user_account (email, display_name) VALUES ($1, $2) RETURNING id`, [email, displayName])
      ).rows[0].id;

    await pool.query(
      `INSERT INTO audit_log (ward_id, user_id, action, details)
       VALUES (NULL, $1, 'SUPPORT_ACCESS_REQUEST_USER_IMPORTED', jsonb_build_object('requestId', $2::text, 'targetUserId', $3::text, 'email', $4::text))`,
      [actingSession.user.id, requestId, userId as string, email]
    );

    revalidatePath('/support/access-requests');
    revalidatePath('/support/users');
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
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold">Support Console: Access Requests</h1>
        <p className="text-muted-foreground">
          Review and triage access intake requests. Use this queue to identify who needs provisioning or role assignment follow-up.
        </p>
        <Link href="/support" className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}>
          Back to support sections
        </Link>
      </section>
      {result.rowCount ? (
        <div className="space-y-3">
          {(result.rows as AccessRequestRow[]).map((row) => (
            <article className="rounded-lg border bg-card p-4 text-card-foreground" key={row.id}>
              <p className="font-medium">
                {row.name} ({row.email})
              </p>
              <p className="text-sm text-muted-foreground">
                {row.stake} · {row.ward}
              </p>
              <p className="mt-2 text-sm">{row.message}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <form action={addStake}>
                  <input type="hidden" name="requestId" value={row.id} />
                  <button type="submit" className="rounded-md border px-3 py-2 text-sm font-medium">
                    Add stake
                  </button>
                </form>
                <form action={addWard}>
                  <input type="hidden" name="requestId" value={row.id} />
                  <button type="submit" className="rounded-md border px-3 py-2 text-sm font-medium">
                    Add ward
                  </button>
                </form>
                <form action={addUser}>
                  <input type="hidden" name="requestId" value={row.id} />
                  <button type="submit" className="rounded-md border px-3 py-2 text-sm font-medium">
                    Add user
                  </button>
                </form>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">No access requests yet.</p>
      )}
    </main>
  );
}
