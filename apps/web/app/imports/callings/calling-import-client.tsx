'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { LcrExtractorInstructions } from '@/components/lcr-extractor-instructions';

type PreviewCalling = {
  memberName: string;
  organization: string;
  callingName: string;
  sustainedDate: string | Date | null;
  setApart: boolean;
};

type CallingDrift = {
  isStale: boolean;
  driftCount: number;
  comparedToImportRunId: string | null;
};

function formatDisplayDate(value: string | Date | null): string {
  if (!value) return '—';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

/**
 * When the user pastes the LCR Members with Callings table, the browser clipboard
 * contains both text/plain (TSV with empty set-apart column) and text/html (with
 * the checkmark SVG intact). This function reads text/html, parses the table via
 * DOMParser, and rebuilds a corrected TSV where the set-apart column contains
 * "yes" or "no" based on SVG presence — so the server-side parser can read it.
 *
 * Returns null if the clipboard doesn't look like an LCR callings table (fall
 * back to default paste behaviour).
 */
function extractTsvFromLcrHtml(html: string): string | null {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, 'text/html');
  } catch {
    return null;
  }

  // Must be an LCR eden-table
  const table = doc.querySelector('table.eden-table-table');
  if (!table) return null;

  // Build header from <th> text content (excluding the select-all checkbox cell)
  const headerCells = Array.from(table.querySelectorAll('thead th')).slice(1);
  const headers = headerCells.map((th) => th.textContent?.trim().replace(/\s+/g, ' ') ?? '');
  if (!headers.includes('Name')) return null;

  const setApartIdx = headers.findIndex((h) => /set apart/i.test(h));

  const rows: string[] = [headers.join('\t')];

  const bodyRows = table.querySelectorAll('tbody tr');
  bodyRows.forEach((tr) => {
    // Skip the select-checkbox cell (first td)
    const cells = Array.from(tr.querySelectorAll('td')).slice(1);
    const cols = cells.map((td, idx) => {
      if (idx === setApartIdx) {
        // Checkmark icon (eden-icon without info-icon class) = set apart
        const hasCheckmark = td.querySelector('svg.eden-icon:not(.member-callings__info-icon)') !== null;
        return hasCheckmark ? 'yes' : 'no';
      }
      // For other cells: strip the card-view cloned header span, return remaining text
      const cloned = td.querySelector('.eden-headings-h6');
      if (cloned) cloned.remove();
      return td.textContent?.trim().replace(/\s+/g, ' ') ?? '';
    });
    const line = cols.join('\t');
    if (line.trim()) rows.push(line);
  });

  return rows.join('\n');
}

export function CallingImportClient({ wardId, initialCallingDrift }: { wardId: string; initialCallingDrift: CallingDrift }) {
  const [callingInputMode, setCallingInputMode] = useState<'pdf' | 'paste'>('paste');
  const [callingPdfFile, setCallingPdfFile] = useState<File | null>(null);
  const [callingRawText, setCallingRawText] = useState('');
  const [callingPreview, setCallingPreview] = useState<PreviewCalling[]>([]);
  const [callingSummary, setCallingSummary] = useState<{
    parsedCount: number;
    inserted: number;
    replacedCount: number;
    matchedMembers: number;
    unmatchedMembers: number;
    commit: boolean;
    stale: CallingDrift;
  } | null>(null);
  const [callingError, setCallingError] = useState<string | null>(null);
  const [isCallingSubmitting, setIsCallingSubmitting] = useState(false);

  function switchCallingMode(mode: 'pdf' | 'paste') {
    setCallingInputMode(mode);
    setCallingPreview([]);
    setCallingSummary(null);
    setCallingError(null);
  }

  async function submitCallingImport(commit: boolean) {
    setIsCallingSubmitting(true);
    setCallingError(null);

    try {
      let response: Response;

      if (callingInputMode === 'paste') {
        response = await fetch(`/api/w/${wardId}/imports/callings`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ rawText: callingRawText, commit })
        });
      } else {
        const formData = new FormData();
        formData.set('commit', commit ? 'true' : 'false');
        if (callingPdfFile) {
          formData.set('file', callingPdfFile);
        }
        response = await fetch(`/api/w/${wardId}/imports/callings`, {
          method: 'POST',
          body: formData
        });
      }

      const payload = (await response.json()) as
        | {
            preview: PreviewCalling[];
            parsedCount: number;
            inserted: number;
            replacedCount: number;
            matchedMembers: number;
            unmatchedMembers: number;
            stale: CallingDrift;
            commit: boolean;
          }
        | { error?: string };

      if (!response.ok || !('preview' in payload)) {
        setCallingError('error' in payload ? (payload.error ?? 'Calling import failed') : 'Calling import failed');
        return;
      }

      setCallingPreview(payload.preview);
      setCallingSummary({
        parsedCount: payload.parsedCount,
        inserted: payload.inserted,
        replacedCount: payload.replacedCount,
        matchedMembers: payload.matchedMembers,
        unmatchedMembers: payload.unmatchedMembers,
        stale: payload.stale,
        commit: payload.commit
      });

      if (commit) {
        window.location.href = '/callings';
      }
    } catch {
      setCallingError('Calling import failed');
    } finally {
      setIsCallingSubmitting(false);
    }
  }

  const drift = callingSummary?.stale ?? initialCallingDrift;

  return (
    <div className="space-y-6">
      <LcrExtractorInstructions targetType="callings" />

      <section className="space-y-4 rounded-lg border bg-card p-5">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Import Callings Data</h2>
          <p className="text-sm text-muted-foreground">
            Importing replaces all active calling assignments. Use the LCR Members with Callings report.
          </p>
        </div>

        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            drift.isStale ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-300 bg-emerald-50 text-emerald-900'
          }`}
        >
          Drift indicator:{' '}
          {drift.isStale
            ? `Stale (${drift.driftCount} differences from latest committed calling import).`
            : 'In sync with latest committed calling import.'}
        </div>

        <div className="flex gap-1 rounded-md border bg-muted/30 p-1 text-sm max-w-xs">
          <button
            type="button"
            onClick={() => switchCallingMode('paste')}
            className={`flex-1 rounded px-3 py-1 transition-colors ${callingInputMode === 'paste' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Paste text
          </button>
          <button
            type="button"
            onClick={() => switchCallingMode('pdf')}
            className={`flex-1 rounded px-3 py-1 transition-colors ${callingInputMode === 'pdf' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Upload PDF
          </button>
        </div>

        {callingInputMode === 'pdf' ? (
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => setCallingPdfFile(event.target.files?.[0] ?? null)}
            className="w-full rounded-md border bg-background p-2 text-sm"
          />
        ) : (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              Open the Members with Callings report, run the extractor bookmarklet or copy the table, and paste below.
            </p>
            <textarea
              value={callingRawText}
              onChange={(event) => setCallingRawText(event.target.value)}
              onPaste={(event) => {
                const html = event.clipboardData.getData('text/html');
                if (html) {
                  const corrected = extractTsvFromLcrHtml(html);
                  if (corrected) {
                    event.preventDefault();
                    setCallingRawText(corrected);
                  }
                }
              }}
              className="min-h-48 w-full rounded-md border bg-background p-3 font-mono text-sm"
              placeholder={
                'Name\tGender\tAge\tBirth Date\tOrganization\tCalling\tSustained\tSet Apart\nJane Doe\tFemale\t35\tJan 15\tRelief Society\tRelief Society President\t15 Jan 2024\tYes'
              }
            />
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={() => submitCallingImport(false)} disabled={isCallingSubmitting}>
            Dry run preview
          </Button>
          <Button type="button" onClick={() => submitCallingImport(true)} disabled={isCallingSubmitting}>
            Commit import
          </Button>
        </div>

        {callingError ? <p className="text-sm text-red-600">{callingError}</p> : null}

        {callingSummary ? (
          <p className="text-sm text-muted-foreground">
            {callingSummary.commit ? 'Commit complete. Redirecting to Callings page...' : 'Preview complete.'} Parsed{' '}
            {callingSummary.parsedCount} rows.
            {callingSummary.commit
              ? ` ${callingSummary.replacedCount} previous callings replaced, ${callingSummary.inserted} inserted, ${callingSummary.matchedMembers} matched to members, ${callingSummary.unmatchedMembers} unmatched.`
              : ''}
          </p>
        ) : null}

        {callingPreview.length ? (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Preview ({callingPreview.length} callings)</h3>
            <div className="overflow-x-auto rounded-md border max-h-96">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 sticky top-0">
                    <th className="px-3 py-2 text-left">Member</th>
                    <th className="px-3 py-2 text-left">Organization</th>
                    <th className="px-3 py-2 text-left">Calling</th>
                    <th className="px-3 py-2 text-left">Sustained Date</th>
                    <th className="px-3 py-2 text-left">Set Apart</th>
                  </tr>
                </thead>
                <tbody>
                  {callingPreview.map((item) => (
                    <tr key={`${item.memberName}-${item.callingName}`} className="border-b last:border-b-0">
                      <td className="px-3 py-2 font-medium">{item.memberName}</td>

                      <td className="px-3 py-2">{item.organization}</td>
                      <td className="px-3 py-2">{item.callingName}</td>
                      <td className="px-3 py-2">{formatDisplayDate(item.sustainedDate)}</td>
                      <td className="px-3 py-2">{item.setApart ? 'Yes' : 'No'}</td>
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
