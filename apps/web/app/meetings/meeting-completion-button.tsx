'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';

type MeetingCompletionButtonProps = {
  wardId: string;
  meetingId: string;
  action: 'complete' | 'reopen';
  label: string;
  confirmMessage: string;
};

export function MeetingCompletionButton({ wardId, meetingId, action, label, confirmMessage }: MeetingCompletionButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function run() {
    if (!window.confirm(confirmMessage)) return;
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(`/api/w/${wardId}/meetings/${meetingId}/${action}`, { method: 'POST' });
      if (!response.ok) {
        setError(true);
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button type="button" size="sm" variant="outline" onClick={() => void run()} disabled={busy}>
        {busy ? '…' : label}
      </Button>
      {error ? <span className="text-xs text-red-600" role="alert">Unable to update meeting.</span> : null}
    </span>
  );
}
