'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';

type DeleteMeetingButtonProps = {
  wardId: string;
  meetingId: string;
  redirectTo?: string;
};

export function DeleteMeetingButton({ wardId, meetingId, redirectTo = '/meetings' }: DeleteMeetingButtonProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteMeeting() {
    if (!window.confirm('Delete this meeting? This cannot be undone.')) return;

    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/w/${wardId}/meetings/${meetingId}`, { method: 'DELETE' });
      if (!response.ok) {
        setError('Unable to delete meeting.');
        setDeleting(false);
        return;
      }
      router.push(redirectTo);
      router.refresh();
    } catch {
      setError('Unable to delete meeting.');
      setDeleting(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button type="button" variant="destructive" onClick={() => void deleteMeeting()} disabled={deleting}>
        {deleting ? 'Deleting...' : 'Delete meeting'}
      </Button>
      {error ? <span className="text-xs text-red-600" role="alert">{error}</span> : null}
    </span>
  );
}
