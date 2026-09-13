'use client';

import { useState } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { WARD_FEATURES, WARD_FEATURE_LABELS, type WardFeature, type WardFeatureFlags } from '@/src/features/types';

export function FeatureSettings({ wardId, initial }: { wardId: string; initial: WardFeatureFlags }) {
  const [features, setFeatures] = useState(initial);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true); setStatus('Saving…');
    try {
      const response = await fetch(`/api/w/${wardId}/feature-flags`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(features) });
      const body = await response.json();
      if (!response.ok) { setStatus(body.error ?? 'Save failed'); return; }
      setFeatures(body.features); setStatus('Saved');
    } catch { setStatus('Save failed. Check connection and try again.'); }
    finally { setSaving(false); }
  }

  return <section className="space-y-4 rounded-lg border bg-card p-5" aria-labelledby="feature-settings-heading">
    <div><h2 id="feature-settings-heading" className="border-b pb-2 text-xl font-medium">Feature availability</h2><p className="mt-2 text-sm text-muted-foreground">Turn optional ward workflows on or off. Disabled features disappear from navigation and reject direct access. Existing data remains stored.</p></div>
    <fieldset className="space-y-3"><legend className="sr-only">Optional feature availability</legend>
      {WARD_FEATURES.map((feature: WardFeature) => <label key={feature} className="flex items-start gap-3 rounded-md border p-3">
        <input type="checkbox" checked={features[feature]} onChange={(event) => setFeatures({ ...features, [feature]: event.target.checked })} className="mt-1 h-4 w-4" />
        <span><span className="block text-sm font-medium">{WARD_FEATURE_LABELS[feature].label}</span><span className="block text-xs text-muted-foreground">{WARD_FEATURE_LABELS[feature].description}</span></span>
      </label>)}
    </fieldset>
    <div className="flex items-center gap-3"><button type="button" onClick={save} disabled={saving} className={cn(buttonVariants({ variant: 'default' }))}>{saving ? 'Saving…' : 'Save feature settings'}</button><span role="status" aria-live="polite" className="text-sm text-muted-foreground">{status}</span></div>
  </section>;
}
