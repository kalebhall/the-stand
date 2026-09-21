'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Template = {
  name: string;
  description?: string | null;
  scopeType: string;
  source: string;
  status: string;
  version?: { version?: number; schemaVersion?: number; lock?: unknown } | null;
};

export function TemplateDetailClient({ wardId, templateId, canCopy }: { wardId: string; templateId: string; canCopy: boolean }) {
  const [template, setTemplate] = useState<Template | null>(null);
  const [message, setMessage] = useState('Loading template…');
  const [duplicating, setDuplicating] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/w/${wardId}/document-templates/${encodeURIComponent(templateId)}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Failed to load template');
        if (active) {
          setTemplate(body.template);
          setMessage('');
        }
      })
      .catch((error: unknown) => {
        if (active) setMessage(error instanceof Error ? error.message : 'Failed to load template');
      });
    return () => {
      active = false;
    };
  }, [templateId, wardId]);

  async function duplicateTemplate() {
    setDuplicating(true);
    setMessage('Duplicating template…');
    try {
      const response = await fetch(`/api/w/${wardId}/document-templates/${encodeURIComponent(templateId)}/duplicate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Duplicate failed');
      setMessage('Template duplicated into Ward Templates. The source remains unchanged.');
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'Duplicate failed');
    } finally {
      setDuplicating(false);
    }
  }

  if (!template) return <main className="mx-auto max-w-3xl p-6"><p role="status">{message}</p></main>;
  const locked = template.scopeType === 'SYSTEM' || template.scopeType === 'STAKE';
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
      <Link href="/programs/templates" className="text-sm font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Back to template gallery</Link>
      <header><p className="text-sm font-medium text-muted-foreground">{template.source === 'BUILT_IN' ? 'System template' : `${template.scopeType.toLowerCase()} template`}</p><h1 className="mt-1 text-3xl font-semibold">{template.name}</h1><p className="mt-2 text-muted-foreground">{template.description ?? 'Sacrament program template'}</p></header>
      <section aria-label="Template metadata" className="rounded-lg border p-4">
        <h2 className="font-semibold">Template metadata</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><dt className="text-sm text-muted-foreground">Scope</dt><dd aria-label={`Scope: ${template.scopeType}`}>{template.scopeType}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Published version</dt><dd aria-label={`Version: ${template.version?.version ?? 'Not published'}`}>{template.version?.version ? `Version ${template.version.version}` : 'Not published'}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Lock mode</dt><dd aria-label={`Lock mode: ${locked ? 'Source locked' : 'Editable ward copy'}`}>{locked ? 'Source locked' : 'Editable ward copy'}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Policy</dt><dd>{locked ? 'Use as-is or duplicate and customize' : 'Use as-is or duplicate'}</dd></div>
        </dl>
      </section>
      <section className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950" aria-label="Template editing policy">
        <h2 className="font-semibold">Source editing is not available</h2>
        <p className="mt-1">Using this template does not edit the published source. To make changes, duplicate it into a ward draft first.</p>
      </section>
      <div className="flex flex-wrap gap-3">
        <Link href="/programs" className="rounded-md border px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Use as-is in a program</Link>
        <button type="button" disabled={!canCopy || duplicating || template.status !== 'PUBLISHED'} onClick={() => void duplicateTemplate()} className="rounded-md border px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{duplicating ? 'Duplicating…' : 'Duplicate and customize'}</button>
      </div>
      {message ? <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{message}</p> : null}
    </main>
  );
}
