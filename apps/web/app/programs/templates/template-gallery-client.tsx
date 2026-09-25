'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

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
  const t = useTranslations('programs');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [status, setStatus] = useState(t('loadingTemplates'));
  const [copying, setCopying] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/w/${wardId}/document-templates`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? t('failedLoadTemplates'));
        if (active) {
          setTemplates(body.templates ?? []);
          setStatus('');
        }
      })
      .catch((error: unknown) => {
        if (active) setStatus(error instanceof Error ? error.message : t('failedLoadTemplates'));
      });
    return () => {
      active = false;
    };
  }, [wardId]);

  const groups = useMemo(() => ({
    [t('builtInTemplates')]: templates.filter((template) => template.source === 'BUILT_IN'),
    [t('stakeTemplates')]: templates.filter((template) => template.source === 'STAKE'),
    [t('wardTemplates')]: templates.filter((template) => template.source === 'WARD'),
    [t('myDrafts')]: templates.filter((template) => template.source === 'PERSONAL_DRAFT')
  }), [templates]);

  async function copyTemplate(template: Template) {
    setCopying(template.id);
    setStatus(t('duplicating'));
    try {
      const response = await fetch(`/api/w/${wardId}/document-templates/${template.id}/duplicate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({})
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? t('duplicateFailed'));
      setTemplates((current) => [...current, {
        id: body.template.id,
        source: 'WARD',
        scopeType: 'WARD',
        name: body.template.name,
        description: body.template.description,
        status: body.template.status,
        version: body.template.version
      }]);
      setStatus(t('copiedToWard'));
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : t('duplicateFailed'));
    } finally {
      setCopying(null);
    }
  }

  function actionLabel(action: TemplateAction): string {
    return action === 'USE_AS_IS' ? t('useAsIs') : t('duplicateCustomize');
  }

  if (status === t('loadingTemplates')) return <p role="status">{status}</p>;
  return (
    <div className="space-y-8">
      <p role="status" aria-live="polite" className="min-h-5 text-sm text-muted-foreground">{status}</p>
      <section aria-label={t('usePolicy')} className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        <h2 className="font-semibold">{t('usePolicy')}</h2>
        <p className="mt-1">{t('usePolicyDescription')}</p>
      </section>
      {Object.entries(groups).map(([heading, entries]) => (
        <section key={heading} aria-labelledby={`${heading}-heading`} className="space-y-3">
          <h2 id={`${heading}-heading`} className="text-xl font-semibold">{heading}</h2>
          {entries.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{entries.map((template) => {
            const locked = isLocked(template);
            const detailsId = `template-details-${template.id}`;
            return (
              <article key={template.id} className="rounded-lg border bg-card p-4 shadow-sm">
                <div className="mb-4 flex h-24 items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground" aria-label={`${template.name} ${t('preview')}`}>{t('preview')}</div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold">{template.name}</h3>
                  {locked ? <span className="rounded-full border px-2 py-0.5 text-xs" title={t('lockedSourceTitle')}>{t('lockedSource')}</span> : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{template.description ?? t('sacramentTemplate')}</p>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <div><dt className="font-medium text-muted-foreground">{t('scope')}</dt><dd aria-label={`${t('scope')}: ${scopeLabels[template.scopeType] ?? template.scopeType}`}>{scopeLabels[template.scopeType] ?? template.scopeType}</dd></div>
                  <div><dt className="font-medium text-muted-foreground">{t('version')}</dt><dd aria-label={`${t('version')}: ${template.version?.version ?? t('notPublished')}`}>{template.version?.version ? `v${template.version.version}` : t('notPublished')}</dd></div>
                  <div><dt className="font-medium text-muted-foreground">{t('status')}</dt><dd>{template.status.toLowerCase()}</dd></div>
                  <div><dt className="font-medium text-muted-foreground">{t('lock')}</dt><dd aria-label={`${t('lock')}: ${locked ? t('sourceLocked') : t('editableCopy')}`}>{locked ? t('sourceLocked') : t('editableCopy')}</dd></div>
                </dl>
                <button type="button" className="mt-3 text-left text-sm font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-expanded={expanded === template.id} aria-controls={detailsId} onClick={() => setExpanded((current) => current === template.id ? null : template.id)}>
                  {expanded === template.id ? t('hidePolicy') : t('showPolicy')}
                </button>
                {expanded === template.id ? <div id={detailsId} className="mt-2 rounded-md bg-muted p-3 text-xs"><p><span className="font-medium">{t('policyLabel')}</span> {policyFor(template)}</p><p className="mt-1">{locked ? t('lockedPolicy') : t('wardPolicy')}</p></div> : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`/programs/templates/${encodeURIComponent(template.id)}`} className="rounded-md border px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{actionLabel('USE_AS_IS')}</Link>
                  {canCopy && template.status.toUpperCase() === 'PUBLISHED' ? <button type="button" aria-label={t('duplicateCustomize')} onClick={() => void copyTemplate(template)} disabled={copying === template.id} className="rounded-md border px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{copying === template.id ? t('duplicating') : <><span>{t('copyToWard')}</span><span className="sr-only">{t('duplicateCustomize')}</span></>}</button> : null}
                </div>
              </article>
            );
          })}</div> : <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{t('noTemplates')}</p>}
        </section>
      ))}
    </div>
  );
}
