'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

type CallingSetApartButtonProps = {
  wardId: string;
  callingId: string;
};

export function CallingSetApartButton({ wardId, callingId }: CallingSetApartButtonProps) {
  const t = useTranslations('callings');
  const router = useRouter();
  const [settingApart, setSettingApart] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setApart() {
    setSettingApart(true);
    setError(null);

    try {
      const response = await fetch(`/api/w/${wardId}/callings/${callingId}/set-apart`, { method: 'POST' });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? t('failedToTransition'));
        setSettingApart(false);
        return;
      }

      router.refresh();
    } catch {
      setError(t('failedToTransition'));
      setSettingApart(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" variant="outline" disabled={settingApart} onClick={() => void setApart()}>
        {t('markSetApart')}
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
