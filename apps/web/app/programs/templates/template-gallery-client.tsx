'use client';

import { useEffect, useMemo, useState } from 'react';

type Template = {
  id: string;
  key?: string | null;
  source: string;
  scopeType: string;
  name: string;
  description?: string | null;
  status: string;
  thumbnail?: string;
};

export function TemplateGalleryClient({ wardId, canCopy }: { wardId: string; canCopy: boolean }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [status, setStatus] = useState('Loading templates…');
  const [copying, setCopying] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    fetch(`/api/w/${wardId}/document-templates`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Failed to load templates');
        if (active) { setTemplates(body.templates ?? []); setStatus(''); }
      })
      .catch((error: unknown) => { if (active) setStatus(error instanceof Error ? error.message : 'Failed to load templates'); });
    return () => { active = false; };
  }, [wardId]);

  const groups = useMemo(() => ({
    'Built-In Templates': templates.filter((template) => template.source === 'BUILT_IN'),
    'Stake Templates': templates.filter((template) => template.source === 'STAKE'),
    'Ward Templates': templates.filter((template) => template.source === 'WARD'),
    'My Drafts': templates.filter((template) => template.source === 'PERSONAL_DRAFT')
  }), [templates]);

  async function copyTemplate(template: Template) {
    setCopying(template.id); setStatus('Copying template…');
    try {
      const response = await fetch(`/api/w/${wardId}/document-templates/${template.id}/duplicate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Copy failed');
      setTemplates((current) => [...current, { id: body.template.id, source: 'WARD', scopeType: 'WARD', name: body.template.name, description: body.template.description, status: body.template.status }]);
      setStatus('Template copied to Ward Templates.');
    } catch (error: unknown) { setStatus(error instanceof Error ? error.message : 'Copy failed'); }
    finally { setCopying(null); }
  }

  if (status === 'Loading templates…') return <p role="status">{status}</p>;
  return (
    <div className="space-y-8">
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{status}</p>
      {Object.entries(groups).map(([heading, entries]) => (
        <section key={heading} aria-labelledby={`${heading}-heading`} className="space-y-3">
          <h2 id={`${heading}-heading`} className="text-xl font-semibold">{heading}</h2>
          {entries.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{entries.map((template) => (
            <article key={template.id} className="rounded-lg border bg-card p-4 shadow-sm">
              <div className="mb-4 flex h-24 items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground">Template preview</div>
              <h3 className="font-semibold">{template.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{template.description ?? 'Sacrament program template'}</p>
              <p className="mt-2 text-xs text-muted-foreground">{template.status} · {template.scopeType}</p>
              {canCopy ? <button type="button" onClick={() => copyTemplate(template)} disabled={copying === template.id} className="mt-4 rounded-md border px-3 py-2 text-sm font-medium">{copying === template.id ? 'Copying…' : 'Copy to ward draft'}</button> : null}
            </article>
          ))}</div> : <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No templates in this section.</p>}
        </section>
      ))}
    </div>
  );
}
