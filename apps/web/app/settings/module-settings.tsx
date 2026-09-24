'use client';

import { useState } from 'react';

type ModuleSetting = {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  defaultEnabled: boolean;
  overridden: boolean;
  canDisable: boolean;
};

export function ModuleSettings({ wardId, initial }: { wardId: string; initial: ModuleSetting[] }) {
  const [modules, setModules] = useState(initial);
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
      const body = await response.json() as { modules?: ModuleSetting[]; error?: string };
      if (!response.ok || !body.modules) throw new Error(body.error ?? 'Failed to save module setting');
      setModules(body.modules);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save module setting');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-3" aria-label="Module settings">
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {modules.map((module) => (
        <div key={module.id} className="flex items-center justify-between gap-4 rounded-md border p-3">
          <div>
            <p className="font-medium">{module.name}</p>
            <p className="text-xs text-muted-foreground">v{module.version}{module.overridden ? ' · Ward override' : ' · Default'}</p>
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
      ))}
    </div>
  );
}
