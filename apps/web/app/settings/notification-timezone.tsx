'use client';

import * as React from 'react';

type TimeZonePreference = { frequency: 'IMMEDIATE' | 'DAILY' | 'WEEKLY'; timezone: string };

type SubscriptionResponse = { emailPreference?: TimeZonePreference; error?: string };

const COMMON_TIME_ZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Australia/Sydney'
];

export function NotificationTimezoneSetting({ wardId }: { wardId: string }) {
  const [timezone, setTimezone] = React.useState('UTC');
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'saving' | 'saved' | 'error'>('loading');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    void fetch(`/api/w/${wardId}/notification-subscriptions`)
      .then(async (response) => {
        const payload = (await response.json()) as SubscriptionResponse;
        if (!response.ok || !payload.emailPreference) throw new Error(payload.error ?? 'Unable to load timezone.');
        if (active) {
          setTimezone(payload.emailPreference.timezone);
          setStatus('ready');
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load timezone.');
          setStatus('error');
        }
      });
    return () => {
      active = false;
    };
  }, [wardId]);

  async function save(nextTimezone: string) {
    setTimezone(nextTimezone);
    setStatus('saving');
    setError(null);
    try {
      const response = await fetch(`/api/w/${wardId}/notification-subscriptions`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ timezone: nextTimezone })
      });
      const payload = (await response.json()) as SubscriptionResponse;
      if (!response.ok || !payload.emailPreference) throw new Error(payload.error ?? 'Unable to save timezone.');
      setTimezone(payload.emailPreference.timezone);
      setStatus('saved');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save timezone.');
      setStatus('error');
    }
  }

  const options = COMMON_TIME_ZONES.includes(timezone) ? COMMON_TIME_ZONES : [timezone, ...COMMON_TIME_ZONES];

  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_18rem] sm:items-center">
      <div>
        <h3 className="font-medium">Notification timezone</h3>
        <p className="text-sm text-muted-foreground">Used for scheduled notification digests.</p>
      </div>
      <div className="grid gap-1">
        <select
          className="rounded border bg-background px-3 py-2"
          aria-label="Notification timezone"
          value={timezone}
          disabled={status === 'loading' || status === 'saving'}
          onChange={(event) => void save(event.target.value)}
        >
          {options.map((value) => (
            <option key={value} value={value}>
              {value.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground" role="status">
          {status === 'loading' ? 'Loading…' : status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : (error ?? '')}
        </span>
      </div>
    </div>
  );
}
