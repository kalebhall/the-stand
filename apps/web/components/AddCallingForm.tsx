'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { CallingAutocomplete } from '@/components/ui/calling-autocomplete';
import { MemberAutocomplete } from '@/components/ui/member-autocomplete';
import { Button } from '@/components/ui/button';

type AddCallingFormProps = {
  wardId: string;
  standardCallings: string[];
  onSuccess: () => void;
};

export function AddCallingForm({ wardId, standardCallings, onSuccess }: AddCallingFormProps) {
  const t = useTranslations('callings');
  const [memberName, setMemberName] = useState('');
  const [callingName, setCallingName] = useState('');
  const [isAssignmentOnly, setIsAssignmentOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const member = memberName.trim();
    const calling = callingName.trim();
    if (!member || !calling) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/w/${wardId}/callings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberName: member, callingName: calling, isAssignmentOnly })
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? t('createFailed'));
        return;
      }

      setMemberName('');
      setCallingName('');
      setIsAssignmentOnly(false);
      onSuccess();
    } catch {
      setError(t('networkError'));
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="add-calling-member">
            {t('memberName')}
          </label>
          <MemberAutocomplete
            wardId={wardId}
            value={memberName}
            onChange={setMemberName}
            placeholder={t('searchOrTypeName')}
            className={inputClass}
            minAge={11}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="add-calling-name">
            {t('calling')}
          </label>
          <CallingAutocomplete
            standardCallings={standardCallings}
            value={callingName}
            onChange={setCallingName}
            placeholder={t('selectOrTypeCalling')}
            className={inputClass}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isAssignmentOnly}
          onChange={(event) => setIsAssignmentOnly(event.target.checked)}
          className="h-4 w-4 rounded border-input"
        />
        <span>{t('assignmentOnly')}</span>
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" size="sm" disabled={submitting || !memberName.trim() || !callingName.trim()}>
        {submitting ? t('adding') : t('addCalling')}
      </Button>
    </form>
  );
}
