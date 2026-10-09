'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

type TemplateOption = {
  id: string;
  name: string;
  source: string;
  scopeType: string;
};

type SettingsResponse = {
  settings?: { defaultSacramentTemplate?: string | null };
};

function optionValue(option: TemplateOption): string {
  return option.source === 'BUILT_IN' ? `builtin:${option.id}` : option.id;
}

export function DefaultProgramTemplateSetting({ wardId }: { wardId: string }) {
  const t = useTranslations('settings');
  const [options, setOptions] = useState<TemplateOption[]>([]);
  const [selected, setSelected] = useState('');
  const [savedSelection, setSavedSelection] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'saving' | 'saved' | 'error'>('loading');
  const generationRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const generation = ++generationRef.current;
    setStatus('loading');
    async function load() {
      try {
        const [settingsResponse, templatesResponse] = await Promise.all([
          fetch(`/api/w/${encodeURIComponent(wardId)}/program-settings`, { signal: controller.signal }),
          fetch(`/api/w/${encodeURIComponent(wardId)}/document-templates`, { signal: controller.signal })
        ]);
        if (!settingsResponse.ok || !templatesResponse.ok) throw new Error('load failed');
        const settings = (await settingsResponse.json()) as SettingsResponse;
        const templateBody = (await templatesResponse.json()) as { templates?: TemplateOption[] };
        const templateOptions = (templateBody.templates ?? []).filter(
          (template) => template.source === 'BUILT_IN' || template.scopeType === 'WARD'
        );
        const initial = settings.settings?.defaultSacramentTemplate ?? '';
        if (!controller.signal.aborted && generation === generationRef.current) {
          setOptions(templateOptions);
          setSelected(initial);
          setSavedSelection(initial);
          setStatus('ready');
        }
      } catch {
        if (!controller.signal.aborted && generation === generationRef.current) setStatus('error');
      }
    }
    void load();
    return () => { controller.abort(); generationRef.current++; };
  }, [wardId]);

  const changed = selected !== savedSelection;
  const selectedName = useMemo(() => options.find((option) => optionValue(option) === selected)?.name ?? '', [options, selected]);

  async function save() {
    if (!changed || status === 'saving') return;
    const generation = generationRef.current;
    setStatus('saving');
    try {
      const response = await fetch(`/api/w/${encodeURIComponent(wardId)}/program-settings`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ defaultSacramentTemplate: selected || null })
      });
      if (!response.ok) throw new Error('save failed');
      if (generation === generationRef.current) {
        setSavedSelection(selected);
        setStatus('saved');
      }
    } catch {
      if (generation === generationRef.current) setStatus('error');
    }
  }

  return (
    <div className="space-y-2 rounded-md border p-4 sm:col-span-2">
      <div>
        <h3 className="font-medium">{t('defaultProgramTemplate')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t('defaultProgramTemplateDescription')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label={t('defaultProgramTemplate')}
          value={selected}
          disabled={status === 'loading' || status === 'saving' || status === 'error'}
          onChange={(event) => { setSelected(event.target.value); setStatus('ready'); }}
          className="min-w-64 rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="">{t('defaultProgramTemplateNone')}</option>
          {options.map((option) => <option key={`${option.source}:${option.id}`} value={optionValue(option)}>{option.name}</option>)}
        </select>
        <button type="button" disabled={!changed || status === 'saving' || status === 'loading' || status === 'error'} onClick={() => void save()} className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50">
          {status === 'saving' ? t('defaultProgramTemplateSaving') : t('defaultProgramTemplateSave')}
        </button>
      </div>
      {status === 'saved' ? <p role="status" className="text-sm">{t('defaultProgramTemplateSaved', { name: selectedName || t('defaultProgramTemplateNone') })}</p> : null}
      {status === 'error' ? <p role="alert" className="text-sm text-destructive">{t('defaultProgramTemplateFailed')}</p> : null}
    </div>
  );
}
