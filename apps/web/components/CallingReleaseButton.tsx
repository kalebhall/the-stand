'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

type CallingReleaseButtonProps = {
  wardId: string;
  callingId: string;
  memberName: string;
  callingName: string;
};

export function CallingReleaseButton({ wardId, callingId, memberName, callingName }: CallingReleaseButtonProps) {
  const t = useTranslations('callings');
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
        setError(payload?.error ?? t('failedToRelease', { member: memberName, calling: callingName }));
        setReleasing(false);
        return;
      }

      router.refresh();
    } catch {
      setError(t('failedToRelease', { member: memberName, calling: callingName }));
      setReleasing(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" type="button" disabled={releasing} onClick={() => void releaseCalling()}>
          {releasing ? t('releasing') : t('confirmRelease')}
        </Button>
        <Button variant="ghost" size="sm" type="button" disabled={releasing} onClick={() => setConfirming(false)}>
          {t('cancel')}
        </Button>
        {error ? <span className="text-xs text-destructive">{error}</span> : null}
      </div>
    );
  }

  return (
    <Button variant="outline" size="sm" type="button" onClick={() => setConfirming(true)}>
      {t('release')}
    </Button>
  );
}
