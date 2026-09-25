'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';

import {
  NOTIFICATION_EVENT_TYPES,
  getNotificationEventDefinition,
  type NotificationChannel,
  type NotificationCategory
} from '@/src/notifications/events';

type EmailFrequency = 'IMMEDIATE' | 'DAILY' | 'WEEKLY';

type Preference = {
  eventType: (typeof NOTIFICATION_EVENT_TYPES)[number];
  category: NotificationCategory;
  label: string;
  channels: Record<NotificationChannel, boolean>;
};

export function NotificationSubscriptionSettings({ wardId, hasUsableEmail }: { wardId: string; hasUsableEmail: boolean }) {
  const t = useTranslations('notifications');
  const [preferences, setPreferences] = React.useState<Preference[]>([]);
  const [emailFrequency, setEmailFrequency] = React.useState<EmailFrequency>('IMMEDIATE');
  const [emailTimezone, setEmailTimezone] = React.useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  });
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'saving' | 'saved' | 'error'>('loading');
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setStatus('loading');
    try {
      const response = await fetch(`/api/w/${wardId}/notification-subscriptions`);
      const payload = (await response.json()) as {
        subscriptions?: Preference[];
        emailPreference?: { frequency: EmailFrequency; timezone: string };
        error?: string;
      };
      if (!response.ok || !payload.subscriptions) throw new Error(payload.error ?? t('loadPreferencesError'));
      setPreferences(payload.subscriptions);
      if (payload.emailPreference) {
        setEmailFrequency(payload.emailPreference.frequency);
        setEmailTimezone(payload.emailPreference.timezone);
      }
      setStatus('ready');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('loadPreferencesError'));
      setStatus('error');
    }
  }, [t, wardId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  function setChannel(eventType: Preference['eventType'], channel: NotificationChannel, enabled: boolean) {
    setPreferences((current) =>
      current.map((preference) =>
        preference.eventType === eventType ? { ...preference, channels: { ...preference.channels, [channel]: enabled } } : preference
      )
    );
    setStatus('ready');
  }

  function setCategoryChannel(category: NotificationCategory, channel: NotificationChannel, enabled: boolean) {
    setPreferences((current) =>
      current.map((preference) =>
        preference.category === category ? { ...preference, channels: { ...preference.channels, [channel]: enabled } } : preference
      )
    );
  }

  function applyDefaults() {
    setPreferences((current) =>
      current.map((preference) => {
        const definition = getNotificationEventDefinition(preference.eventType);
        return {
          ...preference,
          channels: { IN_APP: definition.defaultChannels.includes('IN_APP'), EMAIL: definition.defaultChannels.includes('EMAIL') }
        };
      })
    );
  }

  async function save() {
    setStatus('saving');
    setError(null);
    try {
      const response = await fetch(`/api/w/${wardId}/notification-subscriptions`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subscriptions: preferences.flatMap((preference) =>
            Object.entries(preference.channels).map(([channel, enabled]) => ({
              eventType: preference.eventType,
              channel,
              enabled: channel === 'EMAIL' && !hasUsableEmail ? false : enabled
            }))
          ),
          emailPreference: { frequency: emailFrequency, timezone: emailTimezone }
        })
      });
      const payload = (await response.json()) as {
        subscriptions?: Preference[];
        emailPreference?: { frequency: EmailFrequency; timezone: string };
        error?: string;
      };
      if (!response.ok || !payload.subscriptions) throw new Error(payload.error ?? t('savePreferencesError'));
      setPreferences(payload.subscriptions);
      if (payload.emailPreference) {
        setEmailFrequency(payload.emailPreference.frequency);
        setEmailTimezone(payload.emailPreference.timezone);
      }
      setStatus('saved');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('savePreferencesError'));
      setStatus('error');
    }
  }

  const groups = Array.from(new Set(preferences.map((preference) => preference.category)));
  if (status === 'loading') return <p role="status">{t('loadingPreferences')}</p>;
  if (status === 'error' && preferences.length === 0)
    return (
      <div role="alert" className="space-y-3">
        <p>{error}</p>
        <button className="rounded border px-3 py-2" onClick={() => void load()}>
          {t('tryAgain')}
        </button>
      </div>
    );

  return (
    <div className="space-y-8">
      {!hasUsableEmail && (
        <p className="rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950" role="note">
          {t('emailUnavailable')}
        </p>
      )}
      <section className="space-y-3 rounded border p-4">
        <div>
          <h2 className="text-lg font-medium">{t('emailDelivery')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('emailDeliveryDescription')}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            {t('frequency')}
            <select
              className="rounded border bg-background px-3 py-2"
              aria-label={t('emailFrequency')}
              value={emailFrequency}
              disabled={!hasUsableEmail}
              onChange={(event) => {
                setEmailFrequency(event.target.value as EmailFrequency);
                setStatus('ready');
              }}
            >
              <option value="IMMEDIATE">{t('immediately')}</option>
              <option value="DAILY">{t('dailyDigest')}</option>
              <option value="WEEKLY">{t('weeklyDigest')}</option>
            </select>
          </label>
        </div>
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
          onClick={() => void save()}
          disabled={status === 'saving'}
        >
          {t('savePreferences')}
        </button>
        <button className="rounded border px-3 py-2" onClick={applyDefaults}>
          {t('restoreDefaults')}
        </button>
        <span className="text-sm text-muted-foreground" role="status">
          {status === 'saving' ? t('saving') : status === 'saved' ? t('saved') : (error ?? t('unsavedChanges'))}
        </span>
      </div>
      {groups.map((category) => (
        <section key={category} className="space-y-3" aria-labelledby={`notification-${category}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
            <h2 id={`notification-${category}`} className="text-xl font-medium">
              {t(`categories.${category}`)}
            </h2>
            <div className="flex gap-2 text-sm">
              <button className="underline" onClick={() => setCategoryChannel(category, 'IN_APP', true)}>
                {t('subscribeAllInApp')}
              </button>
              <button className="underline" onClick={() => setCategoryChannel(category, 'EMAIL', true)} disabled={!hasUsableEmail}>
                {t('subscribeAllEmail')}
              </button>
              <button
                className="underline"
                onClick={() => {
                  setCategoryChannel(category, 'IN_APP', false);
                  setCategoryChannel(category, 'EMAIL', false);
                }}
              >
                {t('clearSection')}
              </button>
            </div>
          </div>
          <div className="grid gap-2">
            <div className="hidden grid-cols-[1fr_7rem_7rem] gap-3 px-3 text-sm font-medium text-muted-foreground sm:grid">
              <span>{t('notification')}</span>
              <span>{t('inApp')}</span>
              <span>{t('email')}</span>
            </div>
            {preferences
              .filter((preference) => preference.category === category)
              .map((preference) => (
                <div
                  key={preference.eventType}
                  className="grid gap-2 rounded border p-3 sm:grid-cols-[1fr_7rem_7rem] sm:items-center sm:gap-3"
                >
                  <span>{preference.label}</span>
                  {(['IN_APP', 'EMAIL'] as const).map((channel) => (
                    <label key={channel} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        aria-label={`${preference.label} ${channel === 'IN_APP' ? t('inApp') : t('email')}`}
                        checked={preference.channels[channel]}
                        disabled={channel === 'EMAIL' && !hasUsableEmail}
                        onChange={(event) => setChannel(preference.eventType, channel, event.target.checked)}
                      />{' '}
                      <span className="sm:hidden">{channel === 'IN_APP' ? t('inApp') : t('email')}</span>
                    </label>
                  ))}
                </div>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
