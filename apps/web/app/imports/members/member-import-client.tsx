'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { LcrExtractorInstructions } from '@/components/lcr-extractor-instructions';

type PreviewMember = {
  fullName: string;
  email: string | null;
  phone: string | null;
  age: number | null;
  birthday: string | null;
  gender: string | null;
};

export function MemberImportClient({ wardId }: { wardId: string }) {
  const [memberInputMode, setMemberInputMode] = useState<'pdf' | 'paste'>('paste');
  const [memberPdfFile, setMemberPdfFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState('');
  const [preview, setPreview] = useState<PreviewMember[]>([]);
  const [summary, setSummary] = useState<{ parsedCount: number; inserted: number; updated: number; archived: number; commit: boolean } | null>(null);
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
        setError('error' in payload ? (payload.error ?? 'Import failed') : 'Import failed');
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
      setError('Import failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <LcrExtractorInstructions targetType="members" />

      <section className="space-y-4 rounded-lg border bg-card p-5">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Import Membership Data</h2>
          <p className="text-sm text-muted-foreground">
            Upload the Member List PDF from LCR, or paste tab-delimited text from your clipboard.
          </p>
        </div>

        <div className="flex gap-1 rounded-md border bg-muted/30 p-1 text-sm max-w-xs">
          <button
            type="button"
            onClick={() => switchMemberMode('paste')}
            className={`flex-1 rounded px-3 py-1 transition-colors ${memberInputMode === 'paste' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Paste text
          </button>
          <button
            type="button"
            onClick={() => switchMemberMode('pdf')}
            className={`flex-1 rounded px-3 py-1 transition-colors ${memberInputMode === 'pdf' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Upload PDF
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
                {memberLineCount > 0 ? `${memberLineCount} row${memberLineCount === 1 ? '' : 's'} pasted` : 'No data pasted yet'}
              </span>
              <Button type="button" variant="outline" size="sm" onClick={copyMembershipHeader}>
                {headerCopied ? 'Copied!' : 'Copy header row'}
              </Button>
            </div>
            <textarea
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              className="min-h-48 w-full rounded-md border bg-background p-3 font-mono text-sm"
              placeholder={"Name\tEmail\tPhone\tAge\tBirthday\tGender\nJane Doe\tjane@example.com\t801-555-0101\t35\tJan 15\tFemale"}
            />
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={() => submitImport(false)} disabled={isSubmitting}>
            Dry run preview
          </Button>
          <Button type="button" onClick={() => submitImport(true)} disabled={isSubmitting}>
            Commit import
          </Button>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {summary ? (
          <p className="text-sm text-muted-foreground">
            {summary.commit ? 'Commit complete. Redirecting to Members page...' : 'Preview complete.'} Parsed {summary.parsedCount} members
            {summary.commit
              ? ` (${summary.inserted} inserted, ${summary.updated} updated, ${summary.archived} archived — moved out of ward).`
              : '.'}
          </p>
        ) : null}

        {preview.length ? (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Preview ({preview.length} members)</h3>
            <div className="overflow-x-auto rounded-md border max-h-96">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 sticky top-0">
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Email</th>
                    <th className="px-3 py-2 text-left">Phone</th>
                    <th className="px-3 py-2 text-left">Age</th>
                    <th className="px-3 py-2 text-left">Birthday</th>
                    <th className="px-3 py-2 text-left">Gender</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((item) => (
                    <tr key={item.fullName} className="border-b last:border-b-0">
                      <td className="px-3 py-2 font-medium">{item.fullName}</td>
                      <td className="px-3 py-2">{item.email ?? '—'}</td>
                      <td className="px-3 py-2">{item.phone ?? '—'}</td>
                      <td className="px-3 py-2">{item.age ?? '—'}</td>
                      <td className="px-3 py-2">{item.birthday ?? '—'}</td>
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
