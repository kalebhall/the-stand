'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

type CallingAssignButtonProps = {
  wardId: string;
  callingId: string;
  memberName: string;
  callingName: string;
};

export function CallingAssignButton({ wardId, callingId, memberName, callingName }: CallingAssignButtonProps) {
  const t = useTranslations('callings');
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function convertToAssigned() {
    setAssigning(true);
    setError(null);

    try {
      const response = await fetch(`/api/w/${wardId}/callings/${callingId}/assign`, {
        method: 'POST'
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? t('failedToConvert', { member: memberName, calling: callingName }));
        setAssigning(false);
        return;
      }

      router.refresh();
    } catch {
      setError(t('failedToConvert', { member: memberName, calling: callingName }));
      setAssigning(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" type="button" disabled={assigning} onClick={() => void convertToAssigned()}>
          {assigning ? t('converting') : t('confirmAssigned')}
        </Button>
        <Button variant="ghost" size="sm" type="button" disabled={assigning} onClick={() => setConfirming(false)}>
          {t('cancel')}
        </Button>
        {error ? <span className="text-xs text-destructive">{error}</span> : null}
      </div>
    );
  }

  return (
    <Button variant="outline" size="sm" type="button" onClick={() => setConfirming(true)}>
      {t('convertToAssigned')}
    </Button>
  );
}
