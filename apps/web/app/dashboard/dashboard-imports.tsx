'use client';
 
import { useState } from 'react';
 
import { Button } from '@/components/ui/button';
 
type PreviewMember = {
  fullName: string;
  email: string | null;
  phone: string | null;
};
 
type PreviewCalling = {
  memberName: string;
  callingName: string;
  isRelease: boolean;
};
 
type CallingDrift = {
  isStale: boolean;
  driftCount: number;
  comparedToImportRunId: string | null;
};
 
export function DashboardImports({
  wardId,
  initialCallingDrift
}: {
  wardId: string;
  initialCallingDrift: CallingDrift;
}) {
  const [rawText, setRawText] = useState('');
  const [preview, setPreview] = useState<PreviewMember[]>([]);
  const [summary, setSummary] = useState<{ parsedCount: number; inserted: number; updated: number; commit: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
 
  const [callingRawText, setCallingRawText] = useState('');
  const [callingPreview, setCallingPreview] = useState<PreviewCalling[]>([]);
  const [callingSummary, setCallingSummary] = useState<{
    parsedCount: number;
    activeCount: number;
    releaseCount: number;
    inserted: number;
    reactivated: number;
    releasesApplied: number;
    commit: boolean;
    stale: CallingDrift;
  } | null>(null);
  const [callingError, setCallingError] = useState<string | null>(null);
  const [isCallingSubmitting, setIsCallingSubmitting] = useState(false);
 
  async function submitImport(commit: boolean) {
    setIsSubmitting(true);
    setError(null);
 
    try {
      const response = await fetch(`/api/w/${wardId}/imports/membership`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rawText, commit })
      });
 
      const payload = (await response.json()) as
        | { preview: PreviewMember[]; parsedCount: number; inserted: number; updated: number; commit: boolean }
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
        commit: payload.commit
      });
 
      if (commit) {
        window.location.reload();
      }
    } catch {
      setError('Import failed');
    } finally {
      setIsSubmitting(false);
    }
  }
 
  async function submitCallingImport(commit: boolean) {
    setIsCallingSubmitting(true);
    setCallingError(null);
 
    try {
      const response = await fetch(`/api/w/${wardId}/imports/callings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rawText: callingRawText, commit })
      });
 
      const payload = (await response.json()) as
        | {
            preview: PreviewCalling[];
            parsedCount: number;
            activeCount: number;
            releaseCount: number;
            inserted: number;
            reactivated: number;
            releasesApplied: number;
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
        activeCount: payload.activeCount,
        releaseCount: payload.releaseCount,
        inserted: payload.inserted,
        reactivated: payload.reactivated,
        releasesApplied: payload.releasesApplied,
        stale: payload.stale,
        commit: payload.commit
      });
 
      if (commit) {
        window.location.reload();
      }
    } catch {
      setCallingError('Calling import failed');
    } finally {
      setIsCallingSubmitting(false);
    }
  }
 
  const drift = callingSummary?.stale ?? initialCallingDrift;
 
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="text-lg font-semibold">Import members</h2>
        <p className="text-sm text-muted-foreground">Paste plain text with one member per line: Name, Email, Phone.</p>
        <textarea
          value={rawText}
          onChange={(event) => setRawText(event.target.value)}
          className="min-h-44 w-full rounded-md border bg-background p-3 text-sm"
          placeholder="Jane Doe, jane@example.com, 801-555-0101"
        />
        <div className="flex flex-wrap gap-2">
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
            {summary.commit ? 'Commit complete.' : 'Preview complete.'} Parsed {summary.parsedCount} members
            {summary.commit ? ` (${summary.inserted} inserted, ${summary.updated} updated).` : '.'}
          </p>
        ) : null}
        {preview.length ? (
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">Phone</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((item) => (
                  <tr key={item.fullName} className="border-b last:border-b-0">
                    <td className="px-3 py-2 font-medium">{item.fullName}</td>
                    <td className="px-3 py-2">{item.email ?? '—'}</td>
                    <td className="px-3 py-2">{item.phone ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
 
      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="text-lg font-semibold">Import callings</h2>
        <p className="text-sm text-muted-foreground">Paste plain text callings with one assignment per line. Prefix releases with &quot;Release:&quot;.</p>
 
        <div className={`rounded-md border px-3 py-2 text-sm ${drift.isStale ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-300 bg-emerald-50 text-emerald-900'}`}>
          Drift indicator: {drift.isStale ? `Stale (${drift.driftCount} changes since last committed calling import).` : 'In sync with latest committed calling import.'}
        </div>
 
        <textarea
          value={callingRawText}
          onChange={(event) => setCallingRawText(event.target.value)}
          className="min-h-44 w-full rounded-md border bg-background p-3 text-sm"
          placeholder="John Doe, Elders Quorum President&#10;Release: Jane Doe, Relief Society President"
        />
 
        <div className="flex flex-wrap gap-2">
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
            {callingSummary.commit ? 'Commit complete.' : 'Preview complete.'} Parsed {callingSummary.parsedCount} rows ({callingSummary.activeCount}{' '}
            active, {callingSummary.releaseCount} releases).
            {callingSummary.commit
              ? ` ${callingSummary.inserted} inserted, ${callingSummary.reactivated} reactivated, ${callingSummary.releasesApplied} releases applied.`
              : ''}
          </p>
        ) : null}
 
        {callingPreview.length ? (
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left">Member</th>
                  <th className="px-3 py-2 text-left">Calling</th>
                  <th className="px-3 py-2 text-left">Type</th>
                </tr>
              </thead>
              <tbody>
                {callingPreview.map((item) => (
                  <tr key={`${item.memberName}-${item.callingName}-${item.isRelease ? 'release' : 'sustain'}`} className="border-b last:border-b-0">
                    <td className="px-3 py-2 font-medium">{item.memberName}</td>
                    <td className="px-3 py-2">{item.callingName}</td>
                    <td className="px-3 py-2">{item.isRelease ? 'Release' : 'Sustain'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
