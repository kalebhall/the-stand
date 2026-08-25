'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';

type CallingDeleteButtonProps = {
  wardId: string;
  callingId: string;
  memberName: string;
  callingName: string;
};

export function CallingDeleteButton({ wardId, callingId, memberName, callingName }: CallingDeleteButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteCalling() {
    setDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/w/${wardId}/callings/${callingId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? `Failed to delete ${memberName} — ${callingName}.`);
        setDeleting(false);
        return;
      }

      router.refresh();
    } catch {
      setError(`Failed to delete ${memberName} — ${callingName}.`);
      setDeleting(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="destructive" size="sm" type="button" disabled={deleting} onClick={() => void deleteCalling()}>
          {deleting ? 'Deleting…' : 'Confirm delete'}
        </Button>
        <Button variant="ghost" size="sm" type="button" disabled={deleting} onClick={() => setConfirming(false)}>
          Cancel
        </Button>
        {error ? <span className="text-xs text-destructive">{error}</span> : null}
      </div>
    );
  }

  return (
    <Button variant="outline" size="sm" type="button" onClick={() => setConfirming(true)}>
      Delete
    </Button>
  );
}
