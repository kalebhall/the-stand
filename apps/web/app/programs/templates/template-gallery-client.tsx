'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type TemplateVersion = {
  version?: number;
  schemaVersion?: number;
  lock?: unknown;
};

type Template = {
  id: string;
  key?: string | null;
  source: 'BUILT_IN' | 'STAKE' | 'WARD' | 'PERSONAL_DRAFT' | string;
  scopeType: 'SYSTEM' | 'STAKE' | 'WARD' | 'PERSONAL_DRAFT' | string;
  name: string;
  description?: string | null;
  status: string;
  thumbnail?: string;
  distributionPolicy?: 'USE_AS_IS' | 'DUPLICATE_AND_CUSTOMIZE' | 'REQUIRED' | string | null;
  version?: TemplateVersion | null;
};

type TemplateAction = 'USE_AS_IS' | 'DUPLICATE_AND_CUSTOMIZE';

const scopeLabels: Record<string, string> = {
  SYSTEM: 'System',
  STAKE: 'Stake',
  WARD: 'Ward',
  PERSONAL_DRAFT: 'Personal draft'
};

function policyFor(template: Template): string {
  if (template.distributionPolicy) return template.distributionPolicy.replaceAll('_', ' ').toLowerCase();
  return template.scopeType === 'WARD' || template.scopeType === 'PERSONAL_DRAFT' ? 'use as-is or duplicate and customize' : 'use as-is or duplicate and customize; source is locked';
}

function isLocked(template: Template): boolean {
  return template.scopeType === 'SYSTEM' || template.scopeType === 'STAKE' || Boolean(template.version?.lock && typeof template.version.lock === 'object' && Object.keys(template.version.lock).length > 0);
}

export function TemplateGalleryClient({ wardId, canCopy }: { wardId: string; canCopy: boolean }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [status, setStatus] = useState('Loading templates…');
  const [copying, setCopying] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/w/${wardId}/document-templates`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Failed to load templates');
        if (active) {
          setTemplates(body.templates ?? []);
          setStatus('');
        }
      })
      .catch((error: unknown) => {
        if (active) setStatus(error instanceof Error ? error.message : 'Failed to load templates');
      });
    return () => {
      active = false;
    };
  }, [wardId]);

  const groups = useMemo(() => ({
    'Built-In Templates': templates.filter((template) => template.source === 'BUILT_IN'),
    'Stake Templates': templates.filter((template) => template.source === 'STAKE'),
    'Ward Templates': templates.filter((template) => template.source === 'WARD'),
    'My Drafts': templates.filter((template) => template.source === 'PERSONAL_DRAFT')
  }), [templates]);

  async function copyTemplate(template: Template) {
    setCopying(template.id);
    setStatus('Duplicating template…');
    try {
      const response = await fetch(`/api/w/${wardId}/document-templates/${template.id}/duplicate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({})
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Duplicate failed');
      setTemplates((current) => [...current, {
        id: body.template.id,
        source: 'WARD',
        scopeType: 'WARD',
        name: body.template.name,
        description: body.template.description,
        status: body.template.status,
        version: body.template.version
      }]);
      setStatus('Template copied to Ward Templates.');
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : 'Duplicate failed');
    } finally {
      setCopying(null);
    }
  }

  function actionLabel(action: TemplateAction): string {
    return action === 'USE_AS_IS' ? 'Use as-is' : 'Duplicate and customize';
  }

  if (status === 'Loading templates…') return <p role="status">{status}</p>;
  return (
    <div className="space-y-8">
      <p role="status" aria-live="polite" className="min-h-5 text-sm text-muted-foreground">{status}</p>
      <section aria-label="Template use policy" className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        <h2 className="font-semibold">Template use policy</h2>
        <p className="mt-1">System and stake templates are published sources. You may use them as-is or duplicate them into a ward draft. Source templates are never edited from this gallery.</p>
      </section>
      {Object.entries(groups).map(([heading, entries]) => (
        <section key={heading} aria-labelledby={`${heading}-heading`} className="space-y-3">
          <h2 id={`${heading}-heading`} className="text-xl font-semibold">{heading}</h2>
          {entries.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{entries.map((template) => {
            const locked = isLocked(template);
            const detailsId = `template-details-${template.id}`;
            return (
              <article key={template.id} className="rounded-lg border bg-card p-4 shadow-sm">
                <div className="mb-4 flex h-24 items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground" aria-label={`${template.name} preview`}>Template preview</div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold">{template.name}</h3>
                  {locked ? <span className="rounded-full border px-2 py-0.5 text-xs" title="The source layout cannot be edited here">Locked source</span> : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{template.description ?? 'Sacrament program template'}</p>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <div><dt className="font-medium text-muted-foreground">Scope</dt><dd aria-label={`Scope: ${scopeLabels[template.scopeType] ?? template.scopeType}`}>{scopeLabels[template.scopeType] ?? template.scopeType}</dd></div>
                  <div><dt className="font-medium text-muted-foreground">Version</dt><dd aria-label={`Version: ${template.version?.version ?? 'Not published'}`}>{template.version?.version ? `v${template.version.version}` : 'Not published'}</dd></div>
                  <div><dt className="font-medium text-muted-foreground">Status</dt><dd>{template.status.toLowerCase()}</dd></div>
                  <div><dt className="font-medium text-muted-foreground">Lock</dt><dd aria-label={`Lock mode: ${locked ? 'Source locked' : 'Editable ward copy'}`}>{locked ? 'Source locked' : 'Editable copy'}</dd></div>
                </dl>
                <button type="button" className="mt-3 text-left text-sm font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-expanded={expanded === template.id} aria-controls={detailsId} onClick={() => setExpanded((current) => current === template.id ? null : template.id)}>
                  {expanded === template.id ? 'Hide policy details' : 'Show policy details'}
                </button>
                {expanded === template.id ? <div id={detailsId} className="mt-2 rounded-md bg-muted p-3 text-xs"><p><span className="font-medium">Policy:</span> {policyFor(template)}</p><p className="mt-1">{locked ? 'This source can be used without changing it. Duplicate it before customizing.' : 'This ward copy can be used as-is or duplicated for a separate draft.'}</p></div> : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`/programs/templates/${encodeURIComponent(template.id)}`} className="rounded-md border px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{actionLabel('USE_AS_IS')}</Link>
                  {canCopy && template.status.toUpperCase() === 'PUBLISHED' ? <button type="button" aria-label="Duplicate and customize" onClick={() => void copyTemplate(template)} disabled={copying === template.id} className="rounded-md border px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{copying === template.id ? 'Duplicating…' : <><span>Copy to ward draft</span><span className="sr-only">Duplicate and customize</span></>}</button> : null}
                </div>
              </article>
            );
          })}</div> : <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No templates in this section.</p>}
        </section>
      ))}
    </div>
  );
}
