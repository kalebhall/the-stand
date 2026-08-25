'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';

export type BusinessLine = {
  id: string;
  member_name: string;
  calling_name: string;
  action_type: 'SUSTAIN' | 'RELEASE';
  status: 'pending' | 'announced';
};

type WardBusinessSectionProps = {
  wardId: string;
  meetingId: string;
  lines: BusinessLine[];
  canManage: boolean;
  /** When true, shows "Mark Announced" button for pending lines (stand-view mode). */
  showAnnounce?: boolean;
  /** When true, renders full scripted phrasing using the templates below. */
  showScript?: boolean;
  sustainTemplate?: string;
  releaseTemplate?: string;
};

const ACTION_LABELS: Record<string, string> = {
  SUSTAIN: 'Sustain',
  RELEASE: 'Release'
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  announced: 'Announced'
};

function parseBoldSegments(text: string): Array<{ text: string; bold: boolean }> {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((segment) => {
      if (segment.startsWith('**') && segment.endsWith('**')) {
        return { text: segment.slice(2, -2), bold: true };
      }
      return { text: segment, bold: false };
    });
}

function renderScript(template: string, memberName: string, callingName: string): Array<{ text: string; bold: boolean }> {
  const text = template
    .replaceAll('{memberName}', memberName)
    .replaceAll('{callingName}', callingName);
  return parseBoldSegments(text);
}

function BusinessLineRow({
  line,
  wardId,
  meetingId,
  canManage,
  showAnnounce,
  showScript,
  sustainTemplate,
  releaseTemplate,
  onRefresh
}: {
  line: BusinessLine;
  wardId: string;
  meetingId: string;
  canManage: boolean;
  showAnnounce: boolean;
  showScript: boolean;
  sustainTemplate: string;
  releaseTemplate: string;
  onRefresh: () => void;
}) {
  const [announcing, setAnnouncing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = `/api/w/${wardId}/meetings/${meetingId}/business/${line.id}`;

  async function announce() {
    setAnnouncing(true);
    setError(null);
    try {
      const res = await fetch(base, { method: 'PATCH' });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? 'Failed to mark as announced.');
        setAnnouncing(false);
        return;
      }
      onRefresh();
    } catch {
      setError('Failed to mark as announced.');
      setAnnouncing(false);
    }
  }

  async function remove() {
    setRemoving(true);
    setError(null);
    try {
      const res = await fetch(base, { method: 'DELETE' });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? 'Failed to remove.');
        setRemoving(false);
        setConfirmRemove(false);
        return;
      }
      onRefresh();
    } catch {
      setError('Failed to remove.');
      setRemoving(false);
      setConfirmRemove(false);
    }
  }

  const scriptSegments =
    showScript
      ? renderScript(
          line.action_type === 'SUSTAIN' ? sustainTemplate : releaseTemplate,
          line.member_name,
          line.calling_name
        )
      : null;

  return (
    <li className="rounded-md border">
      {scriptSegments ? (
        /* Scripted (formal) mode: full phrasing with bold segments + actions below */
        <div className="flex flex-col gap-3 p-4">
          <p className="text-sm uppercase tracking-wide text-muted-foreground">
            {ACTION_LABELS[line.action_type] ?? line.action_type}
          </p>
          <p className="text-lg leading-relaxed sm:text-xl">
            {scriptSegments.map((seg, i) =>
              seg.bold ? <strong key={i}>{seg.text}</strong> : <span key={i}>{seg.text}</span>
            )}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {STATUS_LABELS[line.status] ?? line.status}
            </span>
            <div className="flex items-center gap-2">
              {error ? <span className="text-xs text-destructive">{error}</span> : null}
              {canManage && showAnnounce && line.status === 'pending' ? (
                <Button size="sm" variant="outline" disabled={announcing} onClick={() => void announce()}>
                  {announcing ? 'Marking…' : 'Mark Announced'}
                </Button>
              ) : null}
              {canManage ? (
                confirmRemove ? (
                  <>
                    <Button size="sm" variant="destructive" disabled={removing} onClick={() => void remove()}>
                      {removing ? 'Removing…' : 'Confirm remove'}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={removing} onClick={() => setConfirmRemove(false)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(true)}>
                    Remove
                  </Button>
                )
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        /* Compact / edit mode: name — calling badge row */
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
          <div className="flex flex-col gap-0.5">
            <span>
              <span className="font-semibold">{line.member_name}</span>
              {' — '}
              {line.calling_name}
            </span>
            <div className="flex items-center gap-2">
              <span className="rounded-full border px-2 py-0.5 text-xs font-medium">
                {ACTION_LABELS[line.action_type] ?? line.action_type}
              </span>
              <span className="text-xs text-muted-foreground">
                {STATUS_LABELS[line.status] ?? line.status}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {error ? <span className="text-xs text-destructive">{error}</span> : null}
            {canManage && showAnnounce && line.status === 'pending' ? (
              <Button size="sm" variant="outline" disabled={announcing} onClick={() => void announce()}>
                {announcing ? 'Marking…' : 'Mark Announced'}
              </Button>
            ) : null}
            {canManage ? (
              confirmRemove ? (
                <>
                  <Button size="sm" variant="destructive" disabled={removing} onClick={() => void remove()}>
                    {removing ? 'Removing…' : 'Confirm remove'}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={removing} onClick={() => setConfirmRemove(false)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(true)}>
                  Remove
                </Button>
              )
            ) : null}
          </div>
        </div>
      )}
    </li>
  );
}

export function WardBusinessSection({
  wardId,
  meetingId,
  lines,
  canManage,
  showAnnounce = false,
  showScript = false,
  sustainTemplate = 'Those in favor of sustaining **{memberName}** as **{callingName}**, please manifest it.',
  releaseTemplate = 'Those who wish to express appreciation for the service of **{memberName}** as **{callingName}**, please do so.'
}: WardBusinessSectionProps) {
  const router = useRouter();

  if (!lines.length) {
    return (
      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-lg font-semibold">Ward and Stake Business</h2>
        <p className="mt-2 text-sm text-muted-foreground">No callings or releases queued for this meeting.</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="mb-3 text-lg font-semibold">Ward and Stake Business</h2>
      <ul className="space-y-2">
        {lines.map((line) => (
          <BusinessLineRow
            key={line.id}
            line={line}
            wardId={wardId}
            meetingId={meetingId}
            canManage={canManage}
            showAnnounce={showAnnounce}
            showScript={showScript}
            sustainTemplate={sustainTemplate}
            releaseTemplate={releaseTemplate}
            onRefresh={() => router.refresh()}
          />
        ))}
      </ul>
    </section>
  );
}
