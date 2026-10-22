'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

type ModuleSetting = {
  id: string;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  defaultEnabled: boolean;
  overridden: boolean;
  canDisable: boolean;
};

export function ModuleSettings({ wardId, initial }: { wardId: string; initial: ModuleSetting[] }) {
  const t = useTranslations('settings');
  const [modules, setModules] = useState(initial);
  const requiredModules = modules.filter((module) => !module.canDisable);
  const betaModules = modules.filter((module) => module.canDisable);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(module: ModuleSetting): Promise<void> {
    if (!module.canDisable) return;
    if (module.enabled && !window.confirm(`Disable ${module.name}? Existing data will be preserved.`)) return;
    setPending(module.id);
    setError(null);
    try {
      const response = await fetch(`/api/w/${wardId}/module-settings`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ moduleId: module.id, enabled: !module.enabled })
      });
      const body = (await response.json()) as { modules?: ModuleSetting[]; error?: string };
      if (!response.ok || !body.modules) throw new Error(body.error ?? 'Failed to save module setting');
      setModules(body.modules);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save module setting');
    } finally {
      setPending(null);
    }
  }

  const renderModule = (module: ModuleSetting) => (
    <div key={module.id} className="flex items-center justify-between gap-4 rounded-md border p-3">
      <div>
        <p className="font-medium">
          {module.name}
          {module.canDisable ? (
            <span className="ml-2 inline-flex rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
              {t('betaBadge')}
            </span>
          ) : null}
        </p>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{module.description}</p>
        <p className="text-xs text-muted-foreground">
          v{module.version}
          {module.overridden ? ' · Ward override' : module.defaultEnabled ? ' · On by default' : ' · Off by default'}
        </p>
      </div>
      <button
        type="button"
        disabled={!module.canDisable || pending === module.id}
        aria-pressed={module.enabled}
        onClick={() => void toggle(module)}
        className="rounded-md border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
      >
        {!module.canDisable ? 'Required' : pending === module.id ? 'Saving…' : module.enabled ? 'Enabled' : 'Disabled'}
      </button>
    </div>
  );

  return (
    <div className="space-y-3" aria-label={t('modules')}>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {requiredModules.map(renderModule)}
      {betaModules.length ? (
        <details className="rounded-md border">
          <summary className="cursor-pointer px-3 py-3 text-sm font-medium">
            <span>{t('betaAddons')}</span>
            <span className="ml-2 text-xs font-normal text-muted-foreground">{betaModules.length}</span>
            <span className="mt-1 block text-xs font-normal text-muted-foreground">{t('betaAddonsDescription')}</span>
          </summary>
          <div className="space-y-3 border-t p-3">{betaModules.map(renderModule)}</div>
        </details>
      ) : null}
    </div>
  );
}
