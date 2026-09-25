'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

type CallingDeleteButtonProps = {
  wardId: string;
  callingId: string;
  memberName: string;
  callingName: string;
};

export function CallingDeleteButton({ wardId, callingId, memberName, callingName }: CallingDeleteButtonProps) {
  const t = useTranslations('callings');
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
        setError(payload?.error ?? t('failedToDelete', { member: memberName, calling: callingName }));
        setDeleting(false);
        return;
      }

      router.refresh();
    } catch {
      setError(t('failedToDelete', { member: memberName, calling: callingName }));
      setDeleting(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="destructive" size="sm" type="button" disabled={deleting} onClick={() => void deleteCalling()}>
          {deleting ? t('deleting') : t('confirmDelete')}
        </Button>
        <Button variant="ghost" size="sm" type="button" disabled={deleting} onClick={() => setConfirming(false)}>
          {t('cancel')}
        </Button>
        {error ? <span className="text-xs text-destructive">{error}</span> : null}
      </div>
    );
  }

  return (
    <Button variant="outline" size="sm" type="button" onClick={() => setConfirming(true)}>
      {t('delete')}
    </Button>
  );
}
