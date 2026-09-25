'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { LcrExtractorInstructions } from '@/components/lcr-extractor-instructions';

type PreviewMember = {
  fullName: string;
  email: string | null;
  phone: string | null;
  age: number | null;
  gender: string | null;
};

export function MemberImportClient({ wardId }: { wardId: string }) {
  const t = useTranslations('imports.members');
  const [memberInputMode, setMemberInputMode] = useState<'pdf' | 'paste'>('paste');
  const [memberPdfFile, setMemberPdfFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState('');
  const [preview, setPreview] = useState<PreviewMember[]>([]);
  const [summary, setSummary] = useState<{
    parsedCount: number;
    inserted: number;
    updated: number;
    archived: number;
    commit: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [headerCopied, setHeaderCopied] = useState(false);

  const memberLineCount = rawText.trim() ? rawText.trim().split('\n').filter(Boolean).length : 0;

  function copyMembershipHeader() {
    void navigator.clipboard.writeText('Name\tEmail\tPhone\tAge\tBirthday\tGender').then(() => {
      setHeaderCopied(true);
      setTimeout(() => setHeaderCopied(false), 2000);
    });
  }

  function switchMemberMode(mode: 'pdf' | 'paste') {
    setMemberInputMode(mode);
    setPreview([]);
    setSummary(null);
    setError(null);
  }

  async function submitImport(commit: boolean) {
    setIsSubmitting(true);
    setError(null);

    try {
      let response: Response;

      if (memberInputMode === 'paste') {
        response = await fetch(`/api/w/${wardId}/imports/membership`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ rawText, commit })
        });
      } else {
        const formData = new FormData();
        formData.set('commit', commit ? 'true' : 'false');
        if (memberPdfFile) {
          formData.set('file', memberPdfFile);
        }
        response = await fetch(`/api/w/${wardId}/imports/membership`, {
          method: 'POST',
          body: formData
        });
      }

      const payload = (await response.json()) as
        | { preview: PreviewMember[]; parsedCount: number; inserted: number; updated: number; archived: number; commit: boolean }
        | { error?: string };

      if (!response.ok || !('preview' in payload)) {
        setError('error' in payload ? (payload.error ?? t('failed')) : t('failed'));
        return;
      }

      setPreview(payload.preview);
      setSummary({
        parsedCount: payload.parsedCount,
        inserted: payload.inserted,
        updated: payload.updated,
        archived: payload.archived,
        commit: payload.commit
      });

      if (commit) {
        window.location.href = '/members';
      }
    } catch {
      setError(t('failed'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <LcrExtractorInstructions targetType="members" />

      <section className="space-y-4 rounded-lg border bg-card p-5">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{t('dataTitle')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('dataDescription')}
          </p>
        </div>

        <div className="flex gap-1 rounded-md border bg-muted/30 p-1 text-sm max-w-xs">
          <button
            type="button"
            onClick={() => switchMemberMode('paste')}
            className={`flex-1 rounded px-3 py-1 transition-colors ${memberInputMode === 'paste' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {t('paste')}
          </button>
          <button
            type="button"
            onClick={() => switchMemberMode('pdf')}
            className={`flex-1 rounded px-3 py-1 transition-colors ${memberInputMode === 'pdf' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {t('upload')}
          </button>
        </div>

        {memberInputMode === 'pdf' ? (
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => setMemberPdfFile(event.target.files?.[0] ?? null)}
            className="w-full rounded-md border bg-background p-2 text-sm"
          />
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {memberLineCount > 0 ? t('rowsPasted', { count: memberLineCount }) : t('noData')}
              </span>
              <Button type="button" variant="outline" size="sm" onClick={copyMembershipHeader}>
                {headerCopied ? t('copied') : t('copyHeader')}
              </Button>
            </div>
            <textarea
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              className="min-h-48 w-full rounded-md border bg-background p-3 font-mono text-sm"
              placeholder={t('placeholder')}
            />
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={() => submitImport(false)} disabled={isSubmitting}>
            {t('dryRun')}
          </Button>
          <Button type="button" onClick={() => submitImport(true)} disabled={isSubmitting}>
            {t('commit')}
          </Button>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {summary ? (
          <p className="text-sm text-muted-foreground">
            {summary.commit ? t('complete') : t('previewComplete')} {t('parsed', { count: summary.parsedCount })}
            {summary.commit ? ` (${t('summary', { inserted: summary.inserted, updated: summary.updated, archived: summary.archived })})` : '.'}
          </p>
        ) : null}

        {preview.length ? (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{t('preview', { count: preview.length })}</h3>
            <div className="overflow-x-auto rounded-md border max-h-96">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 sticky top-0">
                    <th className="px-3 py-2 text-left">{t('name')}</th>
                    <th className="px-3 py-2 text-left">{t('email')}</th>
                    <th className="px-3 py-2 text-left">{t('phone')}</th>
                    <th className="px-3 py-2 text-left">{t('age')}</th>
                    <th className="px-3 py-2 text-left">{t('gender')}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((item) => (
                    <tr key={item.fullName} className="border-b last:border-b-0">
                      <td className="px-3 py-2 font-medium">{item.fullName}</td>
                      <td className="px-3 py-2">{item.email ?? '—'}</td>
                      <td className="px-3 py-2">{item.phone ?? '—'}</td>
                      <td className="px-3 py-2">{item.age ?? '—'}</td>
                      <td className="px-3 py-2">{item.gender ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
