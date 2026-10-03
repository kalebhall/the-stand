'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

type Template = {
  name: string;
  description?: string | null;
  scopeType: string;
  source: string;
  status: string;
  thumbnail?: string;
  version?: { version?: number; schemaVersion?: number; lock?: unknown } | null;
};

function isApprovedThumbnail(value: string | undefined): value is string {
  return /^\/program-templates\/[A-Za-z0-9._-]+\.svg$/.test(value ?? '');
}

export function TemplateDetailClient({ wardId, templateId, canCopy, canEdit = false }: { wardId: string; templateId: string; canCopy: boolean; canEdit?: boolean }) {
  const t = useTranslations('programs');
  const [template, setTemplate] = useState<Template | null>(null);
  const [message, setMessage] = useState(t('loadingTemplate'));
  const [duplicating, setDuplicating] = useState(false);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/w/${wardId}/document-templates/${encodeURIComponent(templateId)}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? t('failedLoadTemplate'));
        if (active) {
          setTemplate(body.template);
          setThumbnailFailed(false);
          setMessage('');
        }
      })
      .catch((error: unknown) => {
        if (active) setMessage(error instanceof Error ? error.message : t('failedLoadTemplate'));
      });
    return () => {
      active = false;
    };
  }, [templateId, wardId]);

  async function duplicateTemplate() {
    setDuplicating(true);
    setMessage(t('duplicating'));
    try {
      const response = await fetch(`/api/w/${wardId}/document-templates/${encodeURIComponent(templateId)}/duplicate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? t('duplicateFailed'));
      setMessage(t('duplicatedSourceUnchanged'));
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : t('duplicateFailed'));
    } finally {
      setDuplicating(false);
    }
  }

  if (!template) return <main className="mx-auto max-w-3xl p-6"><p role="status">{message}</p></main>;
  const locked = template.scopeType === 'SYSTEM' || template.scopeType === 'STAKE';
  const thumbnail = isApprovedThumbnail(template.thumbnail) && !thumbnailFailed ? template.thumbnail : null;
  const scopeLabel = template.scopeType === 'SYSTEM' ? t('system') : template.scopeType === 'STAKE' ? t('stakeTemplates') : template.scopeType === 'WARD' ? t('wardTemplates') : template.scopeType === 'PERSONAL_DRAFT' ? t('myDrafts') : t('scope');
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
      <Link href="/programs/templates" className="text-sm font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t('backGallery')}</Link>
      <header><p className="text-sm font-medium text-muted-foreground">{template.source === 'BUILT_IN' ? t('systemTemplate') : scopeLabel}</p><h1 className="mt-1 text-3xl font-semibold">{template.name}</h1><p className="mt-2 text-muted-foreground">{template.description ?? t('sacramentTemplate')}</p></header>
      <section aria-label={`${template.name} ${t('preview')}`} className="flex min-h-72 items-center justify-center overflow-hidden rounded-lg border bg-muted p-4">{thumbnail ? <img src={thumbnail} alt={`${template.name} ${t('preview')}`} className="max-h-80 w-full object-contain" onError={() => setThumbnailFailed(true)} /> : <div className="flex h-64 w-3/4 items-center justify-center rounded-sm border bg-background text-sm text-muted-foreground shadow-sm">{t('preview')}</div>}</section>
      <section aria-label={t('templateMetadata')} className="rounded-lg border p-4">
        <h2 className="font-semibold">{t('templateMetadata')}</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><dt className="text-sm text-muted-foreground">{t('scope')}</dt><dd aria-label={`${t('scope')}: ${scopeLabel}`}>{scopeLabel}</dd></div>
          <div><dt className="text-sm text-muted-foreground">{t('publishedVersion')}</dt><dd aria-label={`${t('version')}: ${template.version?.version ?? t('notPublished')}`}>{template.version?.version ? `${t('version')} ${template.version.version}` : t('notPublished')}</dd></div>
          <div><dt className="text-sm text-muted-foreground">{t('lockMode')}</dt><dd aria-label={`${t('lockMode')}: ${locked ? t('sourceLocked') : t('editableWardCopy')}`}>{locked ? t('sourceLocked') : t('editableWardCopy')}</dd></div>
          <div><dt className="text-sm text-muted-foreground">{t('policy')}</dt><dd>{locked ? t('usePolicyLocked') : t('usePolicyCopy')}</dd></div>
        </dl>
      </section>
      <section className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950" aria-label={t('editingUnavailable')}>
        <h2 className="font-semibold">{t('editingUnavailable')}</h2>
        <p className="mt-1">{t('editingUnavailableDescription')}</p>
      </section>
      <div className="flex flex-wrap gap-3">
        <Link href="/programs" className="rounded-md border px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t('useInProgram')}</Link>
        {canEdit && template.status === 'DRAFT' ? <Link href={`/programs/templates/${encodeURIComponent(templateId)}/studio`} className="rounded-md border px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Open Template Studio</Link> : null}
        <button type="button" disabled={!canCopy || duplicating || template.status !== 'PUBLISHED'} onClick={() => void duplicateTemplate()} className="rounded-md border px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{duplicating ? t('duplicating') : t('duplicateCustomize')}</button>
      </div>
      {message ? <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{message}</p> : null}
    </main>
  );
}
