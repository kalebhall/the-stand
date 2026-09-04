'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { parseSacramentPlannerHtml, formatHistoricalDate, type HistoricalMeeting } from '@/src/imports/sacrament-planner';

type ReviewMember = { id: string; full_name: string };
type NameReview = { id: string; source_name: string; occurrence_count: number; first_seen_date: string; last_seen_date: string };

type ImportResult = {
  commit: boolean;
  meetingCount: number;
  importedMeetings: number;
  importedItems: number;
  skippedExisting: number;
  unmatchedNames: string[];
};

export function SacramentPlannerImportClient({ wardId }: { wardId: string }) {
  const [meetings, setMeetings] = useState<HistoricalMeeting[]>([]);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reviews, setReviews] = useState<NameReview[]>([]);
  const [members, setMembers] = useState<ReviewMember[]>([]);
  const [selections, setSelections] = useState<Record<string, string>>({});

  async function loadReviews() {
    const response = await fetch(`/api/w/${wardId}/imports/sacrament-planner/reviews`);
    if (!response.ok) return;
    const payload = (await response.json()) as { reviews: NameReview[]; members: ReviewMember[] };
    setReviews(payload.reviews);
    setMembers(payload.members);
  }

  useEffect(() => {
    void loadReviews();
  }, [wardId]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setResult(null);
    setFileName(file.name);
    try {
      const parsed = parseSacramentPlannerHtml(await file.text());
      setMeetings(parsed);
      if (!parsed.length) setError('No completed meetings were found through August 30, 2026.');
    } catch (caught) {
      setMeetings([]);
      setError(caught instanceof Error ? caught.message : 'Could not read the spreadsheet HTML');
    }
  }

  async function submit(commit: boolean) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/w/${wardId}/imports/sacrament-planner`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ meetings, commit })
      });
      const payload = (await response.json()) as ImportResult | { error?: string };
      if (!response.ok || !('meetingCount' in payload)) {
        setError('error' in payload ? (payload.error ?? 'Import failed') : 'Import failed');
        return;
      }
      setResult(payload);
      if (commit) setMeetings([]);
    } catch {
      setError('Import failed');
    } finally {
      setBusy(false);
    }
  }

  async function reviewName(reviewId: string, action: 'resolve' | 'ignore') {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/w/${wardId}/imports/sacrament-planner/reviews/${reviewId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, memberId: selections[reviewId] })
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? 'Could not update name review');
        return;
      }
      await loadReviews();
    } catch {
      setError('Could not update name review');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="section-panel section-panel--service space-y-4 rounded-lg border bg-card p-5 shadow-sm">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Upload Sacrament Planner</h2>
          <p className="text-sm text-muted-foreground">
            Upload the exported <strong>Sacrament Planner.html</strong> file from your ZIP. Only dates through August 30, 2026 are included;
            future planning columns are ignored.
          </p>
        </div>
        <input
          type="file"
          accept="text/html,.html"
          onChange={(event) => void handleFile(event.target.files?.[0])}
          className="w-full rounded-md border bg-background p-2 text-sm"
        />
        {fileName ? <p className="text-xs text-muted-foreground">Loaded: {fileName}</p> : null}
      </section>

      {meetings.length ? (
        <section className="space-y-4 rounded-lg border bg-card p-5 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold">Import preview</h2>
            <p className="text-sm text-muted-foreground">
              Found {meetings.length} historical meetings from {formatHistoricalDate(meetings[0].meetingDate)} through{' '}
              {formatHistoricalDate(meetings.at(-1)?.meetingDate ?? meetings[0].meetingDate)}. Existing meetings will be preserved and
              skipped.
            </p>
          </div>
          <div className="max-h-72 overflow-auto rounded-md border">
            <ul className="divide-y text-sm">
              {meetings.map((meeting) => (
                <li key={meeting.meetingDate} className="flex justify-between gap-4 px-3 py-2">
                  <span>{formatHistoricalDate(meeting.meetingDate)}</span>
                  <span className="text-muted-foreground">
                    {meeting.programItems.length} program items · {meeting.meetingType}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" onClick={() => void submit(false)} disabled={busy}>
              Dry run preview
            </Button>
            <Button type="button" onClick={() => void submit(true)} disabled={busy}>
              Import completed history
            </Button>
          </div>
        </section>
      ) : null}

      {result ? (
        <section className="space-y-2 rounded-lg border bg-card p-5 shadow-sm">
          <h2 className="font-semibold">{result.commit ? 'Import complete' : 'Dry run complete'}</h2>
          <p className="text-sm text-muted-foreground">
            {result.commit
              ? `Imported ${result.importedMeetings} meetings and ${result.importedItems} program items.`
              : `Reviewed ${result.meetingCount} meetings.`}{' '}
            {result.skippedExisting} existing meetings were preserved and skipped.
          </p>
          {result.unmatchedNames.length ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
              <strong>Names needing review:</strong>
              <p className="mt-1">{result.unmatchedNames.join(', ')}</p>
            </div>
          ) : (
            <p className="text-sm text-green-700">All person entries matched confidently to existing member names.</p>
          )}
        </section>
      ) : null}
      {reviews.length ? (
        <section className="space-y-4 rounded-lg border bg-card p-5 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold">Names needing review</h2>
            <p className="text-sm text-muted-foreground">
              Choose the correct ward member to replace the source text across imported program history. If it is a guest or you are unsure,
              ignore it and leave the original text unchanged.
            </p>
          </div>
          <div className="space-y-3">
            {reviews.map((review) => (
              <div key={review.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <strong>{review.source_name}</strong>
                  <span className="text-muted-foreground">
                    {review.occurrence_count} occurrence{review.occurrence_count === 1 ? '' : 's'} ·{' '}
                    {formatHistoricalDate(review.first_seen_date)} to {formatHistoricalDate(review.last_seen_date)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <select
                    aria-label={`Match ${review.source_name} to a member`}
                    value={selections[review.id] ?? ''}
                    onChange={(event) => setSelections((current) => ({ ...current, [review.id]: event.target.value }))}
                    className="min-w-64 rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Choose a member...</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.full_name}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void reviewName(review.id, 'resolve')}
                    disabled={busy || !selections[review.id]}
                  >
                    Use selected member
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => void reviewName(review.id, 'ignore')} disabled={busy}>
                    Keep source text
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
