'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import type { MembershipOrdinanceActionRow } from '@/src/church-actions/membership-ordinance';

type Props = {
  action: MembershipOrdinanceActionRow;
  wardId: string;
};

type ActionStatus = 'announced' | 'completed' | 'lcr_completed' | 'interview_completed' | 'official_record_started' | 'official_record_completed' | 'certificate_delivered';

export function MembershipOrdinanceWorkspaceControls({ action, wardId }: Props) {
  const t = useTranslations('membershipOrdinances');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(status: ActionStatus) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/w/${encodeURIComponent(wardId)}/meetings/${action.meetingId}/membership-ordinances/${action.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? t('updateActionFailed'));
        return;
      }
      window.location.reload();
    } catch {
      setError(t('serverUnreachable'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {action.interviewStatus === 'needed' || action.interviewStatus === 'scheduled' ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void update('interview_completed')}>
          {t('interviewComplete')}
        </Button>
      ) : null}
      {action.status === 'pending' ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void update('announced')}>
          {t('markAnnounced')}
        </Button>
      ) : null}
      {action.status === 'action_needed' ? (
        <Button size="sm" disabled={busy} onClick={() => void update('completed')}>
          {t('markCompleted')}
        </Button>
      ) : null}
      {action.status === 'completed' && action.lcrFollowUpStatus === 'needed' ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void update('lcr_completed')}>
          {t('markLcrUpdated')}
        </Button>
      ) : null}
      {action.recordFormNeeded && action.officialSystemFollowUpStatus === 'not_started' ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void update('official_record_started')}>
          {t('startOfficialRecordHandoff')}
        </Button>
      ) : null}
      {action.recordFormNeeded && action.officialSystemFollowUpStatus === 'in_progress' ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void update('official_record_completed')}>
          {t('markOfficialRecordUpdated')}
        </Button>
      ) : null}
      {action.recordFormNeeded && action.officialSystemFollowUpStatus === 'completed' && !action.certificateOrFormDelivered ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void update('certificate_delivered')}>
          {t('markCertificateDelivered')}
        </Button>
      ) : null}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
