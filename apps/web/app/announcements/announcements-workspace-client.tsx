'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { isAnnouncementActiveForDate } from '@/src/announcements/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Announcement = {
  id: string;
  title: string;
  body: string | null;
  start_date: string | null;
  end_date: string | null;
  is_permanent: boolean;
  placement: 'PROGRAM_TOP' | 'PROGRAM_BOTTOM';
  include_in_program: boolean;
  include_in_stand: boolean;
  created_at: string;
};

type CalendarFeed = {
  id: string;
  display_name: string;
  feed_scope: 'WARD' | 'STAKE' | 'CHURCH';
  last_refreshed_at: string | null;
  last_refresh_status: string | null;
  last_refresh_error: string | null;
};

type CalendarEvent = {
  id: string;
  calendar_feed_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  tags: string[];
  copied_to_announcement_at: string | null;
};

type AnnouncementsWorkspaceProps = {
  wardId: string;
  targetSunday: string;
  canManage: boolean;
  announcements: Announcement[];
  calendarFeeds: CalendarFeed[];
  calendarEvents: CalendarEvent[];
  actions: {
    createAnnouncement: (formData: FormData) => Promise<void>;
    updateAnnouncement: (formData: FormData) => Promise<void>;
    deleteAnnouncement: (formData: FormData) => Promise<void>;
    copyCalendarEvent: (formData: FormData) => Promise<void>;
    refreshCalendar: () => Promise<void>;
    createCalendarFeed: (formData: FormData) => Promise<void>;
    deleteCalendarFeed: (formData: FormData) => Promise<void>;
  };
};

function formatEventDate(isoString: string, locale: string): string {
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString(locale, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return isoString;
  }
}

export function AnnouncementsWorkspaceClient({
  targetSunday,
  canManage,
  announcements,
  calendarFeeds,
  calendarEvents,
  actions
}: AnnouncementsWorkspaceProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('announcements');
  const [selectedSunday, setSelectedSunday] = useState(targetSunday);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [feedDrawerOpen, setFeedDrawerOpen] = useState(false);

  function handleSundayChange(newDate: string) {
    setSelectedSunday(newDate);
    router.push(`/announcements?sunday=${newDate}`);
  }

  // Active for the selected Sunday meeting
  const activeForSunday = announcements.filter((a) =>
    isAnnouncementActiveForDate(
      {
        startDate: a.start_date,
        endDate: a.end_date,
        isPermanent: a.is_permanent
      },
      selectedSunday
    )
  );

  const activeIds = new Set(activeForSunday.map((a) => a.id));
  const otherAnnouncements = announcements.filter((a) => !activeIds.has(a.id));

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Top Header & Sunday Meeting Selector */}
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <span className="text-muted-foreground">{t('sundayMeeting')}:</span>
            <input
              type="date"
              value={selectedSunday}
              onChange={(e) => handleSundayChange(e.target.value)}
              className="rounded-md border bg-background px-3 py-1.5 text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          {canManage && (
            <Button onClick={() => setIsManualModalOpen(true)} className="font-medium shadow-sm" size="sm">
              + {t('addAnnouncement')}
            </Button>
          )}
        </div>
      </div>

      {/* Two-Pane Workspace */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Pane (5 Cols): Church ICS Feed & Upcoming Events */}
        <section className="space-y-4 lg:col-span-5">
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h2 className="text-base font-semibold">{t('calendarTitle')}</h2>
                <p className="text-xs text-muted-foreground">{t('calendarDescription')}</p>
              </div>
              <div className="flex items-center gap-2">
                {canManage && (
                  <form action={actions.refreshCalendar}>
                    <Button type="submit" variant="outline" size="sm" className="gap-1">
                      ↻ {t('sync')}
                    </Button>
                  </form>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFeedDrawerOpen(!feedDrawerOpen)}
                  className={cn('transition-colors', feedDrawerOpen ? 'bg-secondary text-secondary-foreground font-semibold' : '')}
                >
                  {feedDrawerOpen ? t('closeFeeds') : t('feeds', { count: calendarFeeds.length })}
                </Button>
              </div>
            </div>

            {/* Configured Feeds Section */}
            {feedDrawerOpen && (
              <div className="mt-3 space-y-3 rounded-lg bg-muted/40 p-3 text-sm">
                <div className="flex items-center justify-between font-medium">
                  <span>{t('subscribedFeeds')}</span>
                </div>
                {calendarFeeds.length ? (
                  <ul className="space-y-2">
                    {calendarFeeds.map((feed) => (
                      <li key={feed.id} className="flex items-center justify-between gap-2 rounded border bg-background p-2 text-xs">
                        <div>
                          <p className="font-semibold">
                            {feed.display_name} <span className="text-muted-foreground">({feed.feed_scope})</span>
                          </p>
                          <p className="text-muted-foreground">
                            {t('lastSync', { date: feed.last_refreshed_at ? formatEventDate(feed.last_refreshed_at, locale) : t('never') })}
                          </p>
                          {feed.last_refresh_error && <p className="text-destructive">{feed.last_refresh_error}</p>}
                        </div>
                        {canManage && (
                          <form action={actions.deleteCalendarFeed}>
                            <input type="hidden" name="feedId" value={feed.id} />
                            <Button type="submit" variant="ghost" size="sm" className="h-6 px-2 text-destructive">
                              {t('remove')}
                            </Button>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">{t('noFeeds')}</p>
                )}

                {canManage && (
                  <form action={actions.createCalendarFeed} className="space-y-2 border-t pt-2">
                    <p className="text-xs font-semibold">{t('addFeedUrl')}</p>
                    <input
                      name="displayName"
                      placeholder={t('feedNamePlaceholder')}
                      required
                      className="w-full rounded border bg-background px-2 py-1 text-xs"
                    />
                    <input
                      name="feedUrl"
                      placeholder={t('feedUrlPlaceholder')}
                      required
                      type="url"
                      className="w-full rounded border bg-background px-2 py-1 text-xs"
                    />
                    <div className="flex items-center gap-2">
                      <select name="feedScope" defaultValue="WARD" className="rounded border bg-background px-2 py-1 text-xs">
                        <option value="WARD">{t('ward')}</option>
                        <option value="STAKE">{t('stake')}</option>
                        <option value="CHURCH">{t('church')}</option>
                      </select>
                      <Button type="submit" size="sm" className="h-7 text-xs">
                        {t('addFeed')}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* Calendar Events List */}
            <div className="mt-4 space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {calendarEvents.length ? (
                calendarEvents.map((evt) => (
                  <div
                    key={evt.id}
                    className="group flex flex-col justify-between gap-2 rounded-lg border bg-background p-3 text-sm transition-all hover:border-primary/50"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-foreground">{evt.title}</p>
                        <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                          {formatEventDate(evt.starts_at, locale)}
                        </span>
                      </div>
                      {evt.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{evt.description}</p>}
                      {evt.tags && evt.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {evt.tags.map((t, idx) => (
                            <span key={idx} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {canManage && (
                      <div className="flex items-center justify-between pt-1 border-t mt-1">
                        <span className="text-[11px] text-muted-foreground">
                          {evt.copied_to_announcement_at ? `✓ ${t('inAnnouncements')}` : t('notAdded')}
                        </span>
                        <form action={actions.copyCalendarEvent}>
                          <input type="hidden" name="calendarEventCacheId" value={evt.id} />
                          <Button type="submit" size="sm" variant="secondary" className="h-7 text-xs">
                            {t('copyToProgram')} →
                          </Button>
                        </form>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  {t('noEvents')}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Right Pane (7 Cols): Sunday Meeting Program Announcements */}
        <section className="space-y-4 lg:col-span-7">
          <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-6">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h2 className="text-base font-semibold">{t('programTitle', { date: selectedSunday })}</h2>
                <p className="text-xs text-muted-foreground">
                  {t('programDescription')}
                </p>
              </div>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                {activeForSunday.length} {t('active')}
              </span>
            </div>

            {/* List of Active Announcements for selected Sunday */}
            <div className="mt-4 space-y-3">
              {activeForSunday.length ? (
                activeForSunday.map((item) => (
                  <div key={item.id} className="rounded-lg border bg-background p-4 text-sm shadow-sm">
                    {editingId === item.id ? (
                      <form
                        action={async (formData) => {
                          await actions.updateAnnouncement(formData);
                          setEditingId(null);
                        }}
                        className="space-y-3"
                      >
                        <input type="hidden" name="announcementId" value={item.id} />
                        <div>
                          <label className="text-xs font-semibold">{t('titleLabel')}</label>
                          <input
                            name="title"
                            defaultValue={item.title}
                            required
                            className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm bg-background"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold">{t('bodyLabel')}</label>
                          <textarea
                            name="body"
                            defaultValue={item.body ?? ''}
                            rows={2}
                            className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm bg-background"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-semibold">{t('eventStartDate')}</label>
                            <input
                              name="startDate"
                              type="date"
                              defaultValue={item.start_date ?? ''}
                              className="mt-1 w-full rounded-md border px-2 py-1 text-xs bg-background"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold">{t('endDateOptional')}</label>
                            <input
                              name="endDate"
                              type="date"
                              defaultValue={item.end_date ?? ''}
                              className="mt-1 w-full rounded-md border px-2 py-1 text-xs bg-background"
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-4 pt-1">
                          <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                            <input
                              name="includeInProgram"
                              type="checkbox"
                              defaultChecked={item.include_in_program}
                              className="h-4 w-4 rounded border"
                            />
                            <span>{t('includeOnProgram')}</span>
                          </label>

                          <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                            <input
                              name="includeInStand"
                              type="checkbox"
                              defaultChecked={item.include_in_stand}
                              className="h-4 w-4 rounded border"
                            />
                            <span>{t('announceAtStand')}</span>
                          </label>

                          <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                            <input
                              name="isPermanent"
                              type="checkbox"
                              defaultChecked={item.is_permanent}
                              className="h-4 w-4 rounded border"
                            />
                            <span>{t('neverExpire')}</span>
                          </label>
                        </div>

                        <div className="flex gap-2 pt-2">
                          <Button type="submit" size="sm">
                            {t('save')}
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={() => setEditingId(null)}>
                            {t('cancel')}
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold text-foreground text-base">{item.title}</h3>
                          <div className="flex items-center gap-1.5">
                            {item.include_in_program && (
                              <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                                {t('program')}
                              </span>
                            )}
                            {item.include_in_stand && (
                              <span className="rounded bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400">
                                {t('stand')}
                              </span>
                            )}
                          </div>
                        </div>

                        {item.body && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.body}</p>}

                        <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground border-t">
                          <span>
                            {item.is_permanent || (!item.start_date && !item.end_date)
                              ? t('noExpiration')
                              : item.start_date && item.end_date
                                ? t('dateRange', { start: item.start_date, end: item.end_date })
                                : t('dateOnly', { date: item.start_date ?? item.end_date ?? '' })}
                          </span>

                          {canManage && (
                            <div className="flex items-center gap-2">
                              <button onClick={() => setEditingId(item.id)} className="font-medium text-primary hover:underline text-xs">
                                {t('edit')}
                              </button>
                              <span>·</span>
                              <form action={actions.deleteAnnouncement} className="inline">
                                <input type="hidden" name="announcementId" value={item.id} />
                                <button type="submit" className="font-medium text-destructive hover:underline text-xs">
                                  {t('delete')}
                                </button>
                              </form>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  {t('noActive')}
                </div>
              )}
            </div>

            {/* Other / Expired Announcements toggle */}
            {otherAnnouncements.length > 0 && (
              <details className="mt-6 border-t pt-4">
                <summary className="cursor-pointer text-xs font-semibold uppercase text-muted-foreground">
                  {t('otherExpired', { count: otherAnnouncements.length })}
                </summary>
                <div className="mt-3 space-y-2">
                  {otherAnnouncements.map((item) => (
                    <div key={item.id} className="rounded border bg-muted/20 p-2.5 text-xs opacity-75">
                      <div className="flex items-center justify-between font-medium">
                        <span>{item.title}</span>
                        <span className="text-muted-foreground">
                          {item.is_permanent
                            ? t('permanent')
                            : item.end_date && item.end_date < selectedSunday
                              ? t('expired', { date: item.end_date })
                              : item.start_date && item.start_date > selectedSunday
                                ? t('upcoming', { date: item.start_date })
                                : t('inactive')}
                        </span>
                      </div>
                      {item.body && <p className="mt-1 text-muted-foreground line-clamp-1">{item.body}</p>}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </section>
      </div>

      {/* Manual Add Modal */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-xl">
            <h2 className="text-lg font-bold">{t('addNewTitle')}</h2>
            <p className="text-xs text-muted-foreground">
              {t('addNewDescription')}
            </p>

            <form
              action={async (formData) => {
                await actions.createAnnouncement(formData);
                setIsManualModalOpen(false);
              }}
              className="mt-4 space-y-4 text-sm"
            >
              <div>
                <label className="text-xs font-semibold">{t('titleLabel')}</label>
                <input
                  name="title"
                  required
                  placeholder={t('titlePlaceholder')}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold">{t('descriptionNotes')}</label>
                <textarea
                  name="body"
                  rows={3}
                  placeholder={t('descriptionPlaceholder')}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold">{t('dateOptional')}</label>
                  <input name="startDate" type="date" className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-xs" />
                </div>
                <div>
                  <label className="text-xs font-semibold">{t('endDateOptional')}</label>
                  <input name="endDate" type="date" className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-xs" />
                </div>
              </div>

              <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input name="includeInProgram" type="checkbox" defaultChecked={true} className="h-4 w-4 rounded border" />
                  <span>{t('includeProgramDefault')}</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input name="includeInStand" type="checkbox" defaultChecked={false} className="h-4 w-4 rounded border" />
                  <span>{t('includeStandDefault')}</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input name="isPermanent" type="checkbox" defaultChecked={false} className="h-4 w-4 rounded border" />
                  <span>{t('neverExpire')}</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsManualModalOpen(false)}>
                  {t('cancel')}
                </Button>
                <Button type="submit">{t('createAnnouncement')}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
