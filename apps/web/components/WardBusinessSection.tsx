'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';

import { DEFAULT_STAND_RELEASE_TEMPLATE, DEFAULT_STAND_SUSTAIN_TEMPLATE } from '@/src/stand/default-template';

export type BusinessLine = {
  id: string;
  member_name: string;
  calling_name: string;
  action_type: 'SUSTAIN' | 'RELEASE';
  status: 'pending' | 'announced';
  carried_forward?: boolean;
};

export type MembershipOrdinanceSummary = {
  id: string;
  member_name: string;
  action_type: string;
  priesthood_office?: string | null;
  reason?: string | null;
  details?: string | null;
  status: string;
  baptism_status?: string | null;
  baptism_date?: string | null;
  confirmation_status?: string | null;
  confirmation_date?: string | null;
  responsible_leader?: string | null;
  interview_status?: string | null;
  lcr_follow_up_status?: string | null;
  carried_forward?: boolean;
};

type WardBusinessSectionProps = {
  wardId: string;
  meetingId: string;
  lines: BusinessLine[];
  membershipActions?: MembershipOrdinanceSummary[];
  canManage: boolean;
  /** When true, shows "Mark Announced" button for pending lines (stand-view mode). */
  showAnnounce?: boolean;
  /** When true, renders full scripted phrasing using the templates below. */
  showScript?: boolean;
  /** When true, collapses the section after all business lines are announced. */
  collapsible?: boolean;
  sustainTemplate?: string;
  releaseTemplate?: string;
  programNotes?: string | null;
};

function MembershipOrdinanceRow({ action }: { action: MembershipOrdinanceSummary }) {
  const t = useTranslations('business');
  return (
    <li className="rounded-md border p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {t(action.action_type, { defaultValue: action.action_type.replaceAll('_', ' ') })}
            {action.carried_forward ? ` · ${t('carriedForward')}` : ''}
          </p>
          <p className="font-semibold">{action.member_name}</p>
          {action.priesthood_office ? (
            <p className="text-sm text-muted-foreground">{t('office', { office: action.priesthood_office })}</p>
          ) : null}
          {action.reason ? (
            <p className="text-sm text-muted-foreground">
              {action.reason === 'RECORDS_RECEIVED' ? t('recordsReceived') : t('recentConvert')}
            </p>
          ) : null}
          {action.details ? <p className="text-sm text-muted-foreground">{action.details}</p> : null}
          {action.baptism_status || action.confirmation_status ? (
            <p className="text-sm text-muted-foreground">
              {t('baptism', {
                status: action.baptism_status ?? t('planned'),
                date: action.baptism_date ? ` (${action.baptism_date})` : ''
              })}{' '}
              ·{' '}
              {t('confirmation', {
                status: action.confirmation_status ?? t('planned'),
                date: action.confirmation_date ? ` (${action.confirmation_date})` : ''
              })}
            </p>
          ) : null}
          {action.responsible_leader ? (
            <p className="text-sm text-muted-foreground">{t('responsible', { leader: action.responsible_leader })}</p>
          ) : null}
          {action.interview_status && action.interview_status !== 'not_required' ? (
            <p className="text-sm text-muted-foreground">{t('interview', { status: action.interview_status.replaceAll('_', ' ') })}</p>
          ) : null}
          {action.lcr_follow_up_status === 'needed' ? <p className="text-sm font-medium text-amber-700">{t('lcrUpdateNeeded')}</p> : null}
        </div>
        <span className="rounded-full border px-2 py-1 text-xs">
          {action.status === 'action_needed'
            ? t('actionNeeded')
            : t(action.status, { defaultValue: action.status[0]?.toUpperCase() + action.status.slice(1) })}
        </span>
      </div>
    </li>
  );
}

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
  const text = template.replaceAll('{memberName}', memberName).replaceAll('{callingName}', callingName);
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
  const t = useTranslations('business');
  const actionLabel = line.action_type === 'SUSTAIN' ? t('sustain') : t('release');
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
        setError(payload?.error ?? t('announceFailed'));
        setAnnouncing(false);
        return;
      }
      onRefresh();
    } catch {
      setError(t('announceFailed'));
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
        setError(payload?.error ?? t('removeFailed'));
        setRemoving(false);
        setConfirmRemove(false);
        return;
      }
      onRefresh();
    } catch {
      setError(t('removeFailed'));
      setRemoving(false);
      setConfirmRemove(false);
    }
  }

  const scriptSegments = showScript
    ? renderScript(line.action_type === 'SUSTAIN' ? sustainTemplate : releaseTemplate, line.member_name, line.calling_name)
    : null;

  return (
    <li className="rounded-md border">
      {scriptSegments ? (
        /* Scripted (formal) mode: full phrasing with bold segments + actions below */
        <div className="flex flex-col gap-3 p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {actionLabel}
            {line.carried_forward ? ` · ${t('carriedForward')}` : ''}
          </p>
          <p className="text-lg leading-relaxed sm:text-xl">
            {scriptSegments.map((seg, i) => (seg.bold ? <strong key={i}>{seg.text}</strong> : <span key={i}>{seg.text}</span>))}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{t(line.status)}</span>
            <div className="flex items-center gap-2">
              {error ? <span className="text-xs text-destructive">{error}</span> : null}
              {canManage && showAnnounce && line.status === 'pending' ? (
                <Button size="sm" variant="outline" disabled={announcing} onClick={() => void announce()}>
                  {announcing ? t('marking') : t('markAnnounced')}
                </Button>
              ) : null}
              {canManage ? (
                confirmRemove ? (
                  <>
                    <Button size="sm" variant="destructive" disabled={removing} onClick={() => void remove()}>
                      {removing ? t('removing') : t('confirmRemove')}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={removing} onClick={() => setConfirmRemove(false)}>
                      {t('cancel')}
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(true)}>
                    {t('remove')}
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
              <span className="rounded-full border px-2 py-0.5 text-xs font-medium">{actionLabel}</span>
              {line.carried_forward ? <span className="text-xs text-muted-foreground">{t('carriedForward')}</span> : null}
              <span className="text-xs text-muted-foreground">{t(line.status)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {error ? <span className="text-xs text-destructive">{error}</span> : null}
            {canManage && showAnnounce && line.status === 'pending' ? (
              <Button size="sm" variant="outline" disabled={announcing} onClick={() => void announce()}>
                {announcing ? t('marking') : t('markAnnounced')}
              </Button>
            ) : null}
            {canManage ? (
              confirmRemove ? (
                <>
                  <Button size="sm" variant="destructive" disabled={removing} onClick={() => void remove()}>
                    {removing ? t('removing') : t('confirmRemove')}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={removing} onClick={() => setConfirmRemove(false)}>
                    {t('cancel')}
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(true)}>
                  {t('remove')}
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
  membershipActions = [],
  canManage,
  showAnnounce = false,
  showScript = false,
  collapsible = false,
  sustainTemplate = DEFAULT_STAND_SUSTAIN_TEMPLATE,
  releaseTemplate = DEFAULT_STAND_RELEASE_TEMPLATE,
  programNotes = null
}: WardBusinessSectionProps) {
  const router = useRouter();
  const t = useTranslations('business');

  if (!lines.length && !membershipActions.length) {
    return (
      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('empty')}</p>
      </section>
    );
  }

  const pendingCount = lines.filter((line) => line.status === 'pending').length;
  const announcedCount = lines.length - pendingCount;

  const content = (
    <>
      {programNotes?.trim() ? <p className="mb-3 whitespace-pre-wrap text-sm text-muted-foreground">{programNotes}</p> : null}
      {membershipActions.length ? (
        <div className="mb-3 space-y-2">
          <p className="text-sm font-medium">{t('membershipFollowUp')}</p>
          <ul className="space-y-2">
            {membershipActions.map((action) => (
              <MembershipOrdinanceRow key={action.id} action={action} />
            ))}
          </ul>
        </div>
      ) : null}
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
    </>
  );

  if (!collapsible) {
    return (
      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-lg font-semibold">{t('title')}</h2>
        {content}
      </section>
    );
  }

  return (
    <details className="rounded-lg border bg-card p-4" open={pendingCount > 0}>
      <summary className="cursor-pointer list-none text-lg font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span>{t('title')}</span>
          <span className="text-sm font-normal text-muted-foreground">
            {pendingCount > 0 ? t('pendingCount', { count: pendingCount }) : t('announcedCount', { count: announcedCount })}
          </span>
        </span>
      </summary>
      <div className="mt-3">{content}</div>
    </details>
  );
}
