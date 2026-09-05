'use client';

import { useState } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PUBLIC_ANNOUNCEMENT_MODES, PUBLIC_COVER_MODES, PUBLIC_LAYOUT_PRESETS } from '@/src/meetings/public-layout';

type Layout = { preset: string; announcement_mode: string; cover_mode: string; cover_image_url?: string | null; cover_image_alt_text?: string | null };

export function PublicLayoutClient({ wardId, initial }: { wardId: string; initial: Layout }) {
  const [layout, setLayout] = useState<Layout>(initial);
  const [status, setStatus] = useState('');
  async function save() {
    setStatus('Saving…');
    const response = await fetch(`/api/w/${wardId}/public-layout`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ preset: layout.preset, announcementMode: layout.announcement_mode, coverMode: layout.cover_mode, coverImageUrl: layout.cover_image_url ?? '', coverImageAltText: layout.cover_image_alt_text ?? '' }) });
    const body = await response.json();
    setStatus(response.ok ? 'Saved' : body.error ?? 'Save failed');
    if (response.ok) setLayout(body.layout);
  }
  return <section className="space-y-4 rounded-lg border bg-card p-5 shadow-sm">
    <h2 className="text-lg font-semibold">Public layout</h2>
    <p className="text-sm text-muted-foreground">Text-first presets. Images require an HTTPS URL and descriptive alt text. Settings do not publish draft program changes automatically.</p>
    <label className="block text-sm font-medium">Preset<select value={layout.preset} onChange={(e) => setLayout({ ...layout, preset: e.target.value })} className="mt-1 block w-full rounded-md border bg-background px-3 py-2">{PUBLIC_LAYOUT_PRESETS.map((preset) => <option key={preset}>{preset.replaceAll('_', ' ')}</option>)}</select></label>
    <label className="block text-sm font-medium">Announcements<select value={layout.announcement_mode} onChange={(e) => setLayout({ ...layout, announcement_mode: e.target.value })} className="mt-1 block w-full rounded-md border bg-background px-3 py-2">{PUBLIC_ANNOUNCEMENT_MODES.map((mode) => <option key={mode}>{mode.replaceAll('_', ' ')}</option>)}</select></label>
    <label className="block text-sm font-medium">Cover<select value={layout.cover_mode} onChange={(e) => setLayout({ ...layout, cover_mode: e.target.value })} className="mt-1 block w-full rounded-md border bg-background px-3 py-2">{PUBLIC_COVER_MODES.map((mode) => <option key={mode}>{mode.replaceAll('_', ' ')}</option>)}</select></label>
    {layout.cover_mode === 'AUTHORIZED_IMAGE' ? <div className="space-y-3 rounded-md border p-3"><label className="block text-sm font-medium">Authorized image URL<input type="url" value={layout.cover_image_url ?? ''} onChange={(e) => setLayout({ ...layout, cover_image_url: e.target.value })} placeholder="https://…" className="mt-1 block w-full rounded-md border bg-background px-3 py-2" /></label><label className="block text-sm font-medium">Image alt text<input value={layout.cover_image_alt_text ?? ''} onChange={(e) => setLayout({ ...layout, cover_image_alt_text: e.target.value })} maxLength={240} placeholder="Description of image" className="mt-1 block w-full rounded-md border bg-background px-3 py-2" /></label></div> : null}
    <div className="flex items-center gap-3"><button type="button" onClick={save} className={cn(buttonVariants({ variant: 'default' }))}>Save layout</button><span className="text-sm text-muted-foreground" role="status" aria-live="polite">{status}</span></div>
  </section>;
}
