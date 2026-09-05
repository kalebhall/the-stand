'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import type { MembershipOrdinanceActionRow } from '@/src/church-actions/membership-ordinance';

type Props = {
  action: MembershipOrdinanceActionRow;
  wardId: string;
};

type ActionStatus = 'announced' | 'completed' | 'lcr_completed' | 'interview_completed';

export function MembershipOrdinanceWorkspaceControls({ action, wardId }: Props) {
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
        setError(payload?.error ?? 'Unable to update action.');
        return;
      }
      window.location.reload();
    } catch {
      setError('Unable to reach the server. Try again when online.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {action.interviewStatus === 'needed' || action.interviewStatus === 'scheduled' ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void update('interview_completed')}>
          Interview complete
        </Button>
      ) : null}
      {action.status === 'pending' ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void update('announced')}>
          Mark announced
        </Button>
      ) : null}
      {action.status === 'action_needed' ? (
        <Button size="sm" disabled={busy} onClick={() => void update('completed')}>
          Mark completed
        </Button>
      ) : null}
      {action.status === 'completed' && action.lcrFollowUpStatus === 'needed' ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void update('lcr_completed')}>
          Mark LCR updated
        </Button>
      ) : null}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
