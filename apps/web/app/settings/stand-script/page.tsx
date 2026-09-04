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
  welcome_new_member_template: string;
  baby_blessing_template: string;
  priesthood_ordination_template: string;
  priesthood_advancement_template: string;
};

const DEFAULT_WELCOME = 'Welcome to The Church of Jesus Christ of Latter-day Saints.';
import {
  DEFAULT_STAND_BUSINESS_TEMPLATES,
  DEFAULT_STAND_RELEASE_TEMPLATE,
  DEFAULT_STAND_SUSTAIN_TEMPLATE
} from '@/src/stand/default-template';

const DEFAULT_SUSTAIN = DEFAULT_STAND_SUSTAIN_TEMPLATE;
const DEFAULT_RELEASE = DEFAULT_STAND_RELEASE_TEMPLATE;

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
      'SELECT welcome_text, sustain_template, release_template, welcome_new_member_template, baby_blessing_template, priesthood_ordination_template, priesthood_advancement_template FROM ward_stand_template WHERE ward_id = $1 LIMIT 1',
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
    const welcomeNewMemberTemplate =
      String(formData.get('welcomeNewMemberTemplate') ?? '').trim() || DEFAULT_STAND_BUSINESS_TEMPLATES.WELCOME_NEW_MEMBER;
    const babyBlessingTemplate =
      String(formData.get('babyBlessingTemplate') ?? '').trim() || DEFAULT_STAND_BUSINESS_TEMPLATES.BABY_BLESSING;
    const priesthoodOrdinationTemplate =
      String(formData.get('priesthoodOrdinationTemplate') ?? '').trim() || DEFAULT_STAND_BUSINESS_TEMPLATES.PRIESTHOOD_ORDINATION;
    const priesthoodAdvancementTemplate =
      String(formData.get('priesthoodAdvancementTemplate') ?? '').trim() || DEFAULT_STAND_BUSINESS_TEMPLATES.PRIESTHOOD_ADVANCEMENT;

    const dbClient = await pool.connect();

    try {
      await dbClient.query('BEGIN');
      await setDbContext(dbClient, { userId: session.user.id, wardId: session.activeWardId });

      await dbClient.query(
        `INSERT INTO ward_stand_template (ward_id, welcome_text, sustain_template, release_template, welcome_new_member_template, baby_blessing_template, priesthood_ordination_template, priesthood_advancement_template, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
         ON CONFLICT (ward_id)
         DO UPDATE SET
           welcome_text = excluded.welcome_text,
           sustain_template = excluded.sustain_template,
           release_template = excluded.release_template,
           welcome_new_member_template = excluded.welcome_new_member_template,
           baby_blessing_template = excluded.baby_blessing_template,
           priesthood_ordination_template = excluded.priesthood_ordination_template,
           priesthood_advancement_template = excluded.priesthood_advancement_template,
           updated_at = now()`,
        [
          session.activeWardId,
          welcomeText,
          sustainTemplate,
          releaseTemplate,
          welcomeNewMemberTemplate,
          babyBlessingTemplate,
          priesthoodOrdinationTemplate,
          priesthoodAdvancementTemplate
        ]
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
        <p className="text-sm text-muted-foreground">
          Customize the Formal Script text for your ward. Use placeholders {'{memberName}'} and {'{callingName}'}.
        </p>
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

        <section className="space-y-3 rounded-md border p-3">
          <div>
            <h2 className="font-semibold">Membership and ordinance meeting prompts</h2>
            <p className="text-xs text-muted-foreground">
              These templates are for announcing the action or presenting/sustaining the person before it. They do not replace the ordinance
              or blessing. Use {`{memberName}`} and {`{callingName}`} as placeholders.
            </p>
          </div>
          <label className="block space-y-2 text-sm">
            <span className="font-medium">Welcome new ward member</span>
            <textarea
              name="welcomeNewMemberTemplate"
              defaultValue={template?.welcome_new_member_template ?? DEFAULT_STAND_BUSINESS_TEMPLATES.WELCOME_NEW_MEMBER}
              className="min-h-20 w-full rounded-md border px-3 py-2"
              required
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium">Baby blessing</span>
            <textarea
              name="babyBlessingTemplate"
              defaultValue={template?.baby_blessing_template ?? DEFAULT_STAND_BUSINESS_TEMPLATES.BABY_BLESSING}
              className="min-h-20 w-full rounded-md border px-3 py-2"
              required
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium">Priesthood ordination</span>
            <textarea
              name="priesthoodOrdinationTemplate"
              defaultValue={template?.priesthood_ordination_template ?? DEFAULT_STAND_BUSINESS_TEMPLATES.PRIESTHOOD_ORDINATION}
              className="min-h-20 w-full rounded-md border px-3 py-2"
              required
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium">Priesthood advancement</span>
            <textarea
              name="priesthoodAdvancementTemplate"
              defaultValue={template?.priesthood_advancement_template ?? DEFAULT_STAND_BUSINESS_TEMPLATES.PRIESTHOOD_ADVANCEMENT}
              className="min-h-20 w-full rounded-md border px-3 py-2"
              required
            />
          </label>
        </section>

        <div className="flex justify-end">
          <Button type="submit">Save templates</Button>
        </div>
      </form>
    </main>
  );
}
