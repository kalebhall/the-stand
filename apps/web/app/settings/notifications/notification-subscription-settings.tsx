'use client';

import * as React from 'react';

import { NOTIFICATION_EVENT_TYPES, getNotificationEventDefinition, type NotificationChannel, type NotificationCategory } from '@/src/notifications/events';

type EmailFrequency = 'IMMEDIATE' | 'DAILY' | 'WEEKLY';

type Preference = {
  eventType: (typeof NOTIFICATION_EVENT_TYPES)[number];
  category: NotificationCategory;
  label: string;
  channels: Record<NotificationChannel, boolean>;
};

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  CALLINGS: 'Callings',
  MEMBERSHIP: 'Membership',
  MEETINGS: 'Meetings',
  NOTES: 'Notes and comments',
  ANNOUNCEMENTS: 'Announcements',
  CALENDAR: 'Calendar',
  ACCESS: 'Access and permissions',
  SYSTEM: 'System',
  REMINDERS: 'Reminders'
};

const CHANNEL_LABELS: Record<NotificationChannel, string> = { IN_APP: 'In-app', EMAIL: 'Email' };

export function NotificationSubscriptionSettings({ wardId, hasUsableEmail }: { wardId: string; hasUsableEmail: boolean }) {
  const [preferences, setPreferences] = React.useState<Preference[]>([]);
  const [emailFrequency, setEmailFrequency] = React.useState<EmailFrequency>('IMMEDIATE');
  const [emailTimezone, setEmailTimezone] = React.useState(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
  });
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'saving' | 'saved' | 'error'>('loading');
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setStatus('loading');
    try {
      const response = await fetch(`/api/w/${wardId}/notification-subscriptions`);
      const payload = await response.json() as { subscriptions?: Preference[]; emailPreference?: { frequency: EmailFrequency; timezone: string }; error?: string };
      if (!response.ok || !payload.subscriptions) throw new Error(payload.error ?? 'Unable to load preferences.');
      setPreferences(payload.subscriptions);
      if (payload.emailPreference) {
        setEmailFrequency(payload.emailPreference.frequency);
        setEmailTimezone(payload.emailPreference.timezone);
      }
      setStatus('ready');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load preferences.');
      setStatus('error');
    }
  }, [wardId]);

  React.useEffect(() => { void load(); }, [load]);

  function setChannel(eventType: Preference['eventType'], channel: NotificationChannel, enabled: boolean) {
    setPreferences((current) => current.map((preference) => preference.eventType === eventType
      ? { ...preference, channels: { ...preference.channels, [channel]: enabled } }
      : preference));
    setStatus('ready');
  }

  function setCategoryChannel(category: NotificationCategory, channel: NotificationChannel, enabled: boolean) {
    setPreferences((current) => current.map((preference) => preference.category === category
      ? { ...preference, channels: { ...preference.channels, [channel]: enabled } }
      : preference));
  }

  function applyDefaults() {
    setPreferences((current) => current.map((preference) => {
      const definition = getNotificationEventDefinition(preference.eventType);
      return { ...preference, channels: { IN_APP: definition.defaultChannels.includes('IN_APP'), EMAIL: definition.defaultChannels.includes('EMAIL') } };
    }));
  }

  async function save() {
    setStatus('saving'); setError(null);
    try {
      const response = await fetch(`/api/w/${wardId}/notification-subscriptions`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subscriptions: preferences.flatMap((preference) => Object.entries(preference.channels).map(([channel, enabled]) => ({ eventType: preference.eventType, channel, enabled: channel === 'EMAIL' && !hasUsableEmail ? false : enabled }))),
          emailPreference: { frequency: emailFrequency, timezone: emailTimezone }
        })
      });
      const payload = await response.json() as { subscriptions?: Preference[]; emailPreference?: { frequency: EmailFrequency; timezone: string }; error?: string };
      if (!response.ok || !payload.subscriptions) throw new Error(payload.error ?? 'Unable to save preferences.');
      setPreferences(payload.subscriptions);
      if (payload.emailPreference) {
        setEmailFrequency(payload.emailPreference.frequency);
        setEmailTimezone(payload.emailPreference.timezone);
      }
      setStatus('saved');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save preferences.'); setStatus('error');
    }
  }

  const groups = Array.from(new Set(preferences.map((preference) => preference.category)));
  if (status === 'loading') return <p role="status">Loading notification preferences…</p>;
  if (status === 'error' && preferences.length === 0) return <div role="alert" className="space-y-3"><p>{error}</p><button className="rounded border px-3 py-2" onClick={() => void load()}>Try again</button></div>;

  return <div className="space-y-8">
    {!hasUsableEmail && <p className="rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950" role="note">Email notifications are unavailable because this account has no usable email address.</p>}
    <section className="space-y-3 rounded border p-4">
      <div>
        <h2 className="text-lg font-medium">Email delivery</h2>
        <p className="mt-1 text-sm text-muted-foreground">Choose whether email arrives immediately or as a digest. In-app notifications remain immediate.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">Frequency
          <select className="rounded border bg-background px-3 py-2" aria-label="Email frequency" value={emailFrequency} disabled={!hasUsableEmail} onChange={(event) => { setEmailFrequency(event.target.value as EmailFrequency); setStatus('ready'); }}>
            <option value="IMMEDIATE">Immediately</option>
            <option value="DAILY">Daily digest at 8:00 AM</option>
            <option value="WEEKLY">Weekly digest Monday at 8:00 AM</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">Timezone
          <input className="rounded border bg-background px-3 py-2" aria-label="Email timezone" value={emailTimezone} disabled={!hasUsableEmail} onChange={(event) => { setEmailTimezone(event.target.value); setStatus('ready'); }} placeholder="America/Los_Angeles" />
          <span className="text-xs text-muted-foreground">Use an IANA timezone, such as America/Los_Angeles.</span>
        </label>
      </div>
    </section>
    <div className="flex flex-wrap items-center gap-3">
      <button className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50" onClick={() => void save()} disabled={status === 'saving'}>Save preferences</button>
      <button className="rounded border px-3 py-2" onClick={applyDefaults}>Restore defaults</button>
      <span className="text-sm text-muted-foreground" role="status">{status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : error ?? 'Changes are not saved yet.'}</span>
    </div>
    {groups.map((category) => <section key={category} className="space-y-3" aria-labelledby={`notification-${category}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2"><h2 id={`notification-${category}`} className="text-xl font-medium">{CATEGORY_LABELS[category]}</h2><div className="flex gap-2 text-sm"><button className="underline" onClick={() => setCategoryChannel(category, 'IN_APP', true)}>Subscribe all in-app</button><button className="underline" onClick={() => setCategoryChannel(category, 'EMAIL', true)} disabled={!hasUsableEmail}>Subscribe all by email</button><button className="underline" onClick={() => { setCategoryChannel(category, 'IN_APP', false); setCategoryChannel(category, 'EMAIL', false); }}>Clear section</button></div></div>
      <div className="grid gap-2"><div className="hidden grid-cols-[1fr_7rem_7rem] gap-3 px-3 text-sm font-medium text-muted-foreground sm:grid"><span>Notification</span><span>In-app</span><span>Email</span></div>{preferences.filter((preference) => preference.category === category).map((preference) => <div key={preference.eventType} className="grid gap-2 rounded border p-3 sm:grid-cols-[1fr_7rem_7rem] sm:items-center sm:gap-3"><span>{preference.label}</span>{(['IN_APP', 'EMAIL'] as const).map((channel) => <label key={channel} className="flex items-center gap-2 text-sm"><input type="checkbox" aria-label={`${preference.label} ${CHANNEL_LABELS[channel]}`} checked={preference.channels[channel]} disabled={channel === 'EMAIL' && !hasUsableEmail} onChange={(event) => setChannel(preference.eventType, channel, event.target.checked)} /> <span className="sm:hidden">{CHANNEL_LABELS[channel]}</span></label>)}</div>)}</div>
    </section>)}
  </div>;
}
