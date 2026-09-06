'use client';

import { useState } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PUBLIC_ANNOUNCEMENT_MODES, PUBLIC_COVER_MODES, PUBLIC_LAYOUT_PRESETS } from '@/src/meetings/public-layout';

type Layout = {
  preset: string;
  announcement_mode: string;
  cover_mode: string;
  cover_image_url?: string | null;
  cover_image_alt_text?: string | null;
};

function displayOption(value: string) {
  return value.replaceAll('_', ' ');
}

export function PublicLayoutClient({ wardId, initial }: { wardId: string; initial: Layout }) {
  const [layout, setLayout] = useState<Layout>(initial);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setStatus('Saving…');
    try {
      const response = await fetch(`/api/w/${wardId}/public-layout`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          preset: layout.preset,
          announcementMode: layout.announcement_mode,
          coverMode: layout.cover_mode,
          coverImageUrl: layout.cover_image_url ?? '',
          coverImageAltText: layout.cover_image_alt_text ?? ''
        })
      });
      const body = await response.json();
      if (!response.ok) {
        setStatus(body.error ?? 'Save failed');
        return;
      }
      setLayout(body.layout);
      setStatus('Saved');
    } catch {
      setStatus('Save failed. Check connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4 rounded-lg border bg-card p-5 shadow-sm" aria-labelledby="public-layout-heading">
      <h2 id="public-layout-heading" className="text-lg font-semibold">Public layout</h2>
      <p id="public-layout-help" className="text-sm text-muted-foreground">
        Text-first presets. Images require an HTTPS URL and descriptive alt text. Settings do not publish draft program changes automatically.
      </p>
      <fieldset aria-describedby="public-layout-help" className="space-y-4">
        <legend className="sr-only">Public program layout options</legend>
        <div>
          <label htmlFor="public-layout-preset" className="block text-sm font-medium">Preset</label>
          <select id="public-layout-preset" value={layout.preset} onChange={(event) => setLayout({ ...layout, preset: event.target.value })} className="mt-1 block w-full rounded-md border bg-background px-3 py-2">
            {PUBLIC_LAYOUT_PRESETS.map((preset) => <option key={preset} value={preset}>{displayOption(preset)}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="public-layout-announcements" className="block text-sm font-medium">Announcements</label>
          <select id="public-layout-announcements" value={layout.announcement_mode} onChange={(event) => setLayout({ ...layout, announcement_mode: event.target.value })} className="mt-1 block w-full rounded-md border bg-background px-3 py-2">
            {PUBLIC_ANNOUNCEMENT_MODES.map((mode) => <option key={mode} value={mode}>{displayOption(mode)}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="public-layout-cover" className="block text-sm font-medium">Cover</label>
          <select id="public-layout-cover" value={layout.cover_mode} onChange={(event) => setLayout({ ...layout, cover_mode: event.target.value })} className="mt-1 block w-full rounded-md border bg-background px-3 py-2">
            {PUBLIC_COVER_MODES.map((mode) => <option key={mode} value={mode}>{displayOption(mode)}</option>)}
          </select>
        </div>
        {layout.cover_mode === 'AUTHORIZED_IMAGE' ? (
          <div className="space-y-3 rounded-md border p-3" aria-labelledby="authorized-cover-heading">
            <h3 id="authorized-cover-heading" className="text-sm font-semibold">Authorized cover image</h3>
            <div>
              <label htmlFor="public-layout-cover-url" className="block text-sm font-medium">Image URL</label>
              <input id="public-layout-cover-url" type="url" value={layout.cover_image_url ?? ''} onChange={(event) => setLayout({ ...layout, cover_image_url: event.target.value })} placeholder="https://…" className="mt-1 block w-full rounded-md border bg-background px-3 py-2" />
            </div>
            <div>
              <label htmlFor="public-layout-cover-alt" className="block text-sm font-medium">Image alt text</label>
              <input id="public-layout-cover-alt" value={layout.cover_image_alt_text ?? ''} onChange={(event) => setLayout({ ...layout, cover_image_alt_text: event.target.value })} maxLength={240} placeholder="Description of image" className="mt-1 block w-full rounded-md border bg-background px-3 py-2" />
              <p className="mt-1 text-xs text-muted-foreground">Required for public accessibility; 240 characters maximum.</p>
            </div>
          </div>
        ) : null}
      </fieldset>
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className={cn(buttonVariants({ variant: 'default' }))}>{saving ? 'Saving…' : 'Save layout'}</button>
        <span className="text-sm text-muted-foreground" role="status" aria-live="polite">{status}</span>
      </div>
    </section>
  );
}
