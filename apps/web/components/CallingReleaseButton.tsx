'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';

type CallingReleaseButtonProps = {
  wardId: string;
  callingId: string;
  memberName: string;
  callingName: string;
};

export function CallingReleaseButton({ wardId, callingId, memberName, callingName }: CallingReleaseButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function releaseCalling() {
    setReleasing(true);
    setError(null);

    try {
      const response = await fetch(`/api/w/${wardId}/callings/${callingId}/release`, {
        method: 'POST'
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? `Failed to release ${memberName} — ${callingName}.`);
        setReleasing(false);
        return;
      }

      router.refresh();
    } catch {
      setError(`Failed to release ${memberName} — ${callingName}.`);
      setReleasing(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" type="button" disabled={releasing} onClick={() => void releaseCalling()}>
          {releasing ? 'Releasing…' : 'Confirm release'}
        </Button>
        <Button variant="ghost" size="sm" type="button" disabled={releasing} onClick={() => setConfirming(false)}>
          Cancel
        </Button>
        {error ? <span className="text-xs text-destructive">{error}</span> : null}
      </div>
    );
  }

  return (
    <Button variant="outline" size="sm" type="button" onClick={() => setConfirming(true)}>
      Release
    </Button>
  );
}
