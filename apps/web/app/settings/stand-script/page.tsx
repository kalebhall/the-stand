import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { requireAuthenticatedSession } from '@/src/auth/guards';
import { hasRole } from '@/src/auth/roles';
import { pool } from '@/src/db/client';
import { setDbContext } from '@/src/db/context';

type TemplateRow = {
  welcome_text: string;
  sustain_template: string;
  release_template: string;
};

const DEFAULT_WELCOME = 'Welcome to The Church of Jesus Christ of Latter-day Saints.';
const DEFAULT_SUSTAIN = 'Those in favor of sustaining **{memberName}** as **{callingName}**, please manifest it.';
const DEFAULT_RELEASE = 'Those who wish to express appreciation for the service of **{memberName}** as **{callingName}**, please do so.';

export default async function StandScriptSettingsPage() {
  const session = await requireAuthenticatedSession();

  if (!hasRole(session.user.roles, 'STAND_ADMIN')) {
    redirect('/dashboard');
  }

  if (!session.activeWardId) {
    redirect('/dashboard');
  }

  const wardId = session.activeWardId;
  const client = await pool.connect();

  let template: TemplateRow | null = null;

  try {
    await client.query('BEGIN');
    await setDbContext(client, { userId: session.user.id, wardId });

    const templateResult = await client.query(
      'SELECT welcome_text, sustain_template, release_template FROM ward_stand_template WHERE ward_id = $1 LIMIT 1',
      [wardId]
    );

    if (templateResult.rowCount) {
      template = templateResult.rows[0] as TemplateRow;
    }

    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK');
    throw new Error('Failed to load stand script settings');
  } finally {
    client.release();
  }

  async function updateTemplates(formData: FormData) {
    'use server';

    const session = await requireAuthenticatedSession();

    if (!session.activeWardId || !hasRole(session.user.roles, 'STAND_ADMIN')) {
      redirect('/dashboard');
    }

    const welcomeText = String(formData.get('welcomeText') ?? '').trim() || DEFAULT_WELCOME;
    const sustainTemplate = String(formData.get('sustainTemplate') ?? '').trim() || DEFAULT_SUSTAIN;
    const releaseTemplate = String(formData.get('releaseTemplate') ?? '').trim() || DEFAULT_RELEASE;

    const dbClient = await pool.connect();

    try {
      await dbClient.query('BEGIN');
      await setDbContext(dbClient, { userId: session.user.id, wardId: session.activeWardId });

      await dbClient.query(
        `INSERT INTO ward_stand_template (ward_id, welcome_text, sustain_template, release_template, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (ward_id)
         DO UPDATE SET
           welcome_text = excluded.welcome_text,
           sustain_template = excluded.sustain_template,
           release_template = excluded.release_template,
           updated_at = now()`,
        [session.activeWardId, welcomeText, sustainTemplate, releaseTemplate]
      );

      await dbClient.query(
        `INSERT INTO audit_log (ward_id, user_id, action, details)
         VALUES ($1, $2, 'STAND_SCRIPT_TEMPLATE_UPDATED', jsonb_build_object('hasWelcomeText', true))`,
        [session.activeWardId, session.user.id]
      );

      await dbClient.query('COMMIT');
    } catch {
      await dbClient.query('ROLLBACK');
      throw new Error('Failed to update stand script templates');
    } finally {
      dbClient.release();
    }

    revalidatePath('/settings/stand-script');
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Stand Script Templates</h1>
        <p className="text-sm text-muted-foreground">Customize the Formal Script text for your ward. Use placeholders {'{memberName}'} and {'{callingName}'}.</p>
      </div>

      <form action={updateTemplates} className="space-y-4 rounded-lg border bg-card p-4">
        <label className="space-y-2 text-sm">
          <span className="font-medium">Welcome text</span>
          <textarea
            name="welcomeText"
            defaultValue={template?.welcome_text ?? DEFAULT_WELCOME}
            className="min-h-20 w-full rounded-md border px-3 py-2"
            required
          />
        </label>

        <label className="space-y-2 text-sm">
          <span className="font-medium">Sustain phrasing</span>
          <textarea
            name="sustainTemplate"
            defaultValue={template?.sustain_template ?? DEFAULT_SUSTAIN}
            className="min-h-20 w-full rounded-md border px-3 py-2"
            required
          />
        </label>

        <label className="space-y-2 text-sm">
          <span className="font-medium">Release phrasing</span>
          <textarea
            name="releaseTemplate"
            defaultValue={template?.release_template ?? DEFAULT_RELEASE}
            className="min-h-20 w-full rounded-md border px-3 py-2"
            required
          />
        </label>

        <div className="flex justify-end">
          <Button type="submit">Save templates</Button>
        </div>
      </form>
    </main>
  );
}
