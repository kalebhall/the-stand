'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAnnouncementActiveForDate } from '@/src/announcements/types';
import { Button } from '@/components/ui/button';

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

function formatEventDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString(undefined, {
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
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Announcements Workspace</h1>
          <p className="text-sm text-muted-foreground">
            Plan ward announcements for sacrament meeting programs and stand conducting.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <span className="text-muted-foreground">Sunday Meeting:</span>
            <input
              type="date"
              value={selectedSunday}
              onChange={(e) => handleSundayChange(e.target.value)}
              className="rounded-md border bg-background px-3 py-1.5 text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          {canManage && (
            <Button
              onClick={() => setIsManualModalOpen(true)}
              className="font-medium shadow-sm"
              size="sm"
            >
              + Add Announcement
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
                <h2 className="text-base font-semibold">Ward & Church Calendar</h2>
                <p className="text-xs text-muted-foreground">Events from official ICS feeds</p>
              </div>
              <div className="flex items-center gap-2">
                {canManage && (
                  <form action={actions.refreshCalendar}>
                    <Button type="submit" variant="outline" size="sm">
                      ↻ Sync
                    </Button>
                  </form>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setFeedDrawerOpen(!feedDrawerOpen)}
                >
                  {feedDrawerOpen ? 'Close Feeds' : 'Feeds (' + calendarFeeds.length + ')'}
                </Button>
              </div>
            </div>

            {/* Configured Feeds Section */}
            {feedDrawerOpen && (
              <div className="mt-3 space-y-3 rounded-lg bg-muted/40 p-3 text-sm">
                <div className="flex items-center justify-between font-medium">
                  <span>Subscribed Feeds</span>
                </div>
                {calendarFeeds.length ? (
                  <ul className="space-y-2">
                    {calendarFeeds.map((feed) => (
                      <li key={feed.id} className="flex items-center justify-between gap-2 rounded border bg-background p-2 text-xs">
                        <div>
                          <p className="font-semibold">{feed.display_name} <span className="text-muted-foreground">({feed.feed_scope})</span></p>
                          <p className="text-muted-foreground">Last sync: {feed.last_refreshed_at ? formatEventDate(feed.last_refreshed_at) : 'Never'}</p>
                          {feed.last_refresh_error && <p className="text-destructive">{feed.last_refresh_error}</p>}
                        </div>
                        {canManage && (
                          <form action={actions.deleteCalendarFeed}>
                            <input type="hidden" name="feedId" value={feed.id} />
                            <Button type="submit" variant="ghost" size="sm" className="h-6 px-2 text-destructive">
                              Remove
                            </Button>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">No ICS calendar feeds added yet.</p>
                )}

                {canManage && (
                  <form action={actions.createCalendarFeed} className="space-y-2 border-t pt-2">
                    <p className="text-xs font-semibold">Add Feed URL</p>
                    <input name="displayName" placeholder="Feed Name (e.g. Ward Calendar)" required className="w-full rounded border bg-background px-2 py-1 text-xs" />
                    <input name="feedUrl" placeholder="https://.../feed.ics" required type="url" className="w-full rounded border bg-background px-2 py-1 text-xs" />
                    <div className="flex items-center gap-2">
                      <select name="feedScope" defaultValue="WARD" className="rounded border bg-background px-2 py-1 text-xs">
                        <option value="WARD">Ward</option>
                        <option value="STAKE">Stake</option>
                        <option value="CHURCH">Church</option>
                      </select>
                      <Button type="submit" size="sm" className="h-7 text-xs">Add Feed</Button>
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
                          {formatEventDate(evt.starts_at)}
                        </span>
                      </div>
                      {evt.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{evt.description}</p>
                      )}
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
                          {evt.copied_to_announcement_at ? '✓ In announcements' : 'Not added'}
                        </span>
                        <form action={actions.copyCalendarEvent}>
                          <input type="hidden" name="calendarEventCacheId" value={evt.id} />
                          <Button type="submit" size="sm" variant="secondary" className="h-7 text-xs">
                            Copy to Program →
                          </Button>
                        </form>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No upcoming calendar events in the feed cache. Click <strong>Sync</strong> to fetch latest events.
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
                <h2 className="text-base font-semibold">
                  Program Announcements for {selectedSunday}
                </h2>
                <p className="text-xs text-muted-foreground">
                  Carried over from previous weeks unless date has passed. Undated announcements never expire.
                </p>
              </div>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                {activeForSunday.length} Active
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
                          <label className="text-xs font-semibold">Title</label>
                          <input
                            name="title"
                            defaultValue={item.title}
                            required
                            className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm bg-background"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold">Body / Description</label>
                          <textarea
                            name="body"
                            defaultValue={item.body ?? ''}
                            rows={2}
                            className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm bg-background"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-semibold">Event / Start Date</label>
                            <input
                              name="startDate"
                              type="date"
                              defaultValue={item.start_date ?? ''}
                              className="mt-1 w-full rounded-md border px-2 py-1 text-xs bg-background"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold">End Date (optional)</label>
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
                            <span>Include on Program</span>
                          </label>

                          <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                            <input
                              name="includeInStand"
                              type="checkbox"
                              defaultChecked={item.include_in_stand}
                              className="h-4 w-4 rounded border"
                            />
                            <span>Announce at Stand</span>
                          </label>

                          <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                            <input
                              name="isPermanent"
                              type="checkbox"
                              defaultChecked={item.is_permanent}
                              className="h-4 w-4 rounded border"
                            />
                            <span>Never Expire (Permanent)</span>
                          </label>
                        </div>

                        <div className="flex gap-2 pt-2">
                          <Button type="submit" size="sm">Save</Button>
                          <Button type="button" variant="outline" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                        </div>
                      </form>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold text-foreground text-base">{item.title}</h3>
                          <div className="flex items-center gap-1.5">
                            {item.include_in_program && (
                              <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                                Program
                              </span>
                            )}
                            {item.include_in_stand && (
                              <span className="rounded bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400">
                                Stand
                              </span>
                            )}
                          </div>
                        </div>

                        {item.body && (
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.body}</p>
                        )}

                        <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground border-t">
                          <span>
                            {item.is_permanent || (!item.start_date && !item.end_date)
                              ? 'No expiration (Undated)'
                              : item.start_date && item.end_date
                              ? `${item.start_date} → ${item.end_date}`
                              : `Date: ${item.start_date ?? item.end_date}`}
                          </span>

                          {canManage && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setEditingId(item.id)}
                                className="font-medium text-primary hover:underline text-xs"
                              >
                                Edit
                              </button>
                              <span>·</span>
                              <form action={actions.deleteAnnouncement} className="inline">
                                <input type="hidden" name="announcementId" value={item.id} />
                                <button
                                  type="submit"
                                  className="font-medium text-destructive hover:underline text-xs"
                                >
                                  Delete
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
                  No announcements active for this Sunday. Use <strong>Copy to Program</strong> from the calendar on the left or click <strong>+ Add Announcement</strong>.
                </div>
              )}
            </div>

            {/* Other / Expired Announcements toggle */}
            {otherAnnouncements.length > 0 && (
              <details className="mt-6 border-t pt-4">
                <summary className="cursor-pointer text-xs font-semibold uppercase text-muted-foreground">
                  Other / Expired Announcements ({otherAnnouncements.length})
                </summary>
                <div className="mt-3 space-y-2">
                  {otherAnnouncements.map((item) => (
                    <div key={item.id} className="rounded border bg-muted/20 p-2.5 text-xs opacity-75">
                      <div className="flex items-center justify-between font-medium">
                        <span>{item.title}</span>
                        <span className="text-muted-foreground">
                          {item.start_date ? `Expired (${item.start_date})` : 'Inactive'}
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
            <h2 className="text-lg font-bold">Add New Announcement</h2>
            <p className="text-xs text-muted-foreground">
              Create a custom announcement. Leave dates blank for non-expiring ward announcements.
            </p>

            <form
              action={async (formData) => {
                await actions.createAnnouncement(formData);
                setIsManualModalOpen(false);
              }}
              className="mt-4 space-y-4 text-sm"
            >
              <div>
                <label className="text-xs font-semibold">Title</label>
                <input
                  name="title"
                  required
                  placeholder="e.g. Ward Temple Day"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold">Description / Notes</label>
                <textarea
                  name="body"
                  rows={3}
                  placeholder="Details, times, contact person..."
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold">Date (optional)</label>
                  <input
                    name="startDate"
                    type="date"
                    className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold">End Date (optional)</label>
                  <input
                    name="endDate"
                    type="date"
                    className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    name="includeInProgram"
                    type="checkbox"
                    defaultChecked={true}
                    className="h-4 w-4 rounded border"
                  />
                  <span>Include on Program (Default: On)</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    name="includeInStand"
                    type="checkbox"
                    defaultChecked={false}
                    className="h-4 w-4 rounded border"
                  />
                  <span>Announce at Stand (Default: Off)</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    name="isPermanent"
                    type="checkbox"
                    defaultChecked={false}
                    className="h-4 w-4 rounded border"
                  />
                  <span>Never Expire (Permanent)</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsManualModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Create Announcement</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
