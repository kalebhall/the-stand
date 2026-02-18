'use client';

import { useState } from 'react';

import { CallingAutocomplete } from '@/components/ui/calling-autocomplete';
import { MemberAutocomplete } from '@/components/ui/member-autocomplete';
import { Button } from '@/components/ui/button';

type AddCallingFormProps = {
  wardId: string;
  standardCallings: string[];
  onSuccess: () => void;
};

export function AddCallingForm({ wardId, standardCallings, onSuccess }: AddCallingFormProps) {
  const [memberName, setMemberName] = useState('');
  const [callingName, setCallingName] = useState('');
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
        body: JSON.stringify({ memberName: member, callingName: calling }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Failed to create calling.');
        return;
      }

      setMemberName('');
      setCallingName('');
      onSuccess();
    } catch {
      setError('Network error. Please try again.');
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
            Member Name
          </label>
          <MemberAutocomplete
            wardId={wardId}
            value={memberName}
            onChange={setMemberName}
            placeholder="Search or type a name…"
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="add-calling-name">
            Calling
          </label>
          <CallingAutocomplete
            standardCallings={standardCallings}
            value={callingName}
            onChange={setCallingName}
            placeholder="Select or type a calling…"
            className={inputClass}
          />
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" size="sm" disabled={submitting || !memberName.trim() || !callingName.trim()}>
        {submitting ? 'Adding…' : 'Add Calling'}
      </Button>
    </form>
  );
}
