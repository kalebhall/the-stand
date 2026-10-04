'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

export function AdvancedDesignerSetting({ wardId }: { wardId: string }) {
  const t = useTranslations('settings');
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const loadGeneration = useRef(0);

  const load = useCallback(async (signal?: AbortSignal) => {
      const generation = ++loadGeneration.current;
      setError(null);
      setEnabled(null);
      setSaved(false);
      setSaving(false);
      try {
        const response = await fetch(`/api/w/${encodeURIComponent(wardId)}/program-settings`, { signal });
        if (!response.ok) throw new Error(t('advancedDesignerLoadFailed'));
        const body: unknown = await response.json();
        if (!body || typeof body !== 'object' || !('settings' in body) || !body.settings || typeof body.settings !== 'object' || !('allowAdvancedProgramDesigner' in body.settings) || typeof body.settings.allowAdvancedProgramDesigner !== 'boolean') {
          throw new Error(t('advancedDesignerLoadFailed'));
        }
        if (!signal?.aborted && generation === loadGeneration.current) setEnabled(body.settings.allowAdvancedProgramDesigner);
      } catch {
        if (!signal?.aborted && generation === loadGeneration.current) setError(t('advancedDesignerLoadFailed'));
      }
  }, [wardId, t]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => { controller.abort(); loadGeneration.current++; };
  }, [load]);

  async function toggle() {
    if (enabled === null || saving) return;
    const generation = loadGeneration.current;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch(`/api/w/${encodeURIComponent(wardId)}/program-settings`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ allowAdvancedProgramDesigner: !enabled })
      });
      if (!response.ok) throw new Error(t('advancedDesignerSaveFailed'));
      const body: unknown = await response.json();
      if (!body || typeof body !== 'object' || !('settings' in body) || !body.settings || typeof body.settings !== 'object' || !('allowAdvancedProgramDesigner' in body.settings) || typeof body.settings.allowAdvancedProgramDesigner !== 'boolean') {
        throw new Error(t('advancedDesignerSaveFailed'));
      }
      if (generation === loadGeneration.current) {
        setEnabled(body.settings.allowAdvancedProgramDesigner);
        setSaved(true);
      }
    } catch {
      if (generation === loadGeneration.current) setError(t('advancedDesignerSaveFailed'));
    } finally {
      if (generation === loadGeneration.current) setSaving(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md border p-4 sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">{t('advancedDesigner')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t('advancedDesignerDescription')}</p>
        </div>
        <button type="button" aria-label={t('advancedDesigner')} aria-pressed={enabled === true} disabled={enabled === null || saving} onClick={() => void toggle()} className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">
          {enabled === null ? error ? t('advancedDesignerUnavailable') : t('advancedDesignerLoading') : saving ? t('advancedDesignerSaving') : enabled ? t('advancedDesignerEnabled') : t('advancedDesignerDisabled')}
        </button>
      </div>
      {saved ? <p role="status" className="text-sm">{t('advancedDesignerSaved')}</p> : null}
      {error ? <div className="flex flex-wrap items-center gap-3"><p role="alert" className="text-sm text-destructive">{error}</p>{enabled === null ? <button type="button" className="rounded-md border px-3 py-1.5 text-sm" onClick={() => void load()}>{t('advancedDesignerRetry')}</button> : null}</div> : null}
    </div>
  );
}
