'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

const ACTION_LABELS: Record<string, string> = {
  MEETING_CREATED: 'Meeting Created',
  MEETING_UPDATED: 'Meeting Updated',
  MEETING_DELETED: 'Meeting Deleted',
  MEETING_PUBLISHED: 'Meeting Published',
  MEETING_REPUBLISHED: 'Meeting Republished',
  MEETING_COMPLETED: 'Meeting Completed',
  ANNOUNCEMENT_CREATED: 'Announcement Created',
  ANNOUNCEMENT_UPDATED: 'Announcement Updated',
  ANNOUNCEMENT_DELETED: 'Announcement Deleted',
  CALLING_PROPOSED: 'Calling Proposed',
  CALLING_ASSIGNED: 'Calling Assigned',
  CALLING_EXTENDED: 'Calling Extended',
  CALLING_SUSTAINED: 'Calling Sustained',
  CALLING_SET_APART: 'Calling Set Apart',
  CALLING_DELETED: 'Calling Deleted',
  MEMBER_ARCHIVED: 'Member Archived',
  MEMBER_UPDATED: 'Member Updated',
  MEMBER_NOTE_ADDED: 'Note Added',
  MEMBER_NOTE_EDITED: 'Note Edited',
  MEMBER_NOTE_DELETED: 'Note Deleted',
  WARD_ROLE_ASSIGNED: 'Role Assigned',
  WARD_ROLE_REVOKED: 'Role Revoked',
  MEMBERSHIP_IMPORT_COMMITTED: 'Members Imported',
  CALLINGS_IMPORT_COMMITTED: 'Callings Imported',
  MEMBER_IMPORT_COMMITTED: 'Members Imported',
};

function actionLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  return action
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function severityBadge(severity: string | null) {
  const s = (severity || 'info').toLowerCase();
  if (s === 'security') {
    return <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">Security</span>;
  }
  if (s === 'notice') {
    return <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Notice</span>;
  }
  return <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">Info</span>;
}

function sourceBadge(source: string | null) {
  const src = source || 'manual_ui';
  if (src === 'lcr_import') {
    return <span className="inline-flex items-center rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-800">LCR Sync</span>;
  }
  if (src === 'api') {
    return <span className="inline-flex items-center rounded bg-cyan-100 px-1.5 py-0.5 text-xs font-medium text-cyan-800">API</span>;
  }
  if (src === 'bulk_sync') {
    return <span className="inline-flex items-center rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-medium text-indigo-800">Bulk Sync</span>;
  }
  return <span className="inline-flex items-center rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-700">Manual UI</span>;
}

function actionColor(action: string): string {
  if (action.includes('DELETE') || action.includes('REVOKE') || action.includes('DEACTIVAT') || action.includes('RELEASE')) {
    return 'bg-red-100 text-red-800';
  }
  if (action.includes('CREATE') || action.includes('ASSIGN') || action.includes('BOOTSTRAP') || action.includes('IMPORT') || action.includes('SUSTAIN') || action.includes('SET_APART')) {
    return 'bg-green-100 text-green-800';
  }
  if (action.includes('UPDATE') || action.includes('PUBLISH') || action.includes('REPUBLISH') || action.includes('COMPLETE')) {
    return 'bg-blue-100 text-blue-800';
  }
  return 'bg-yellow-100 text-yellow-800';
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export type AuditLogItem = {
  id: string;
  userId: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  targetMemberId: string | null;
  targetMemberName: string | null;
  entityType: string | null;
  entityId: string | null;
  changes: Record<string, { old: unknown; new: unknown }> | null;
  previousState: Record<string, unknown> | null;
  details: Record<string, unknown> | null;
  source: string | null;
  severity: string | null;
  isCrossWardSupport: boolean;
  callingName: string | null;
  organization: string | null;
  callingStatus: string | null;
  meetingDate: string | null;
  itemType: string | null;
  itemTitle: string | null;
  createdAt: string;
  userEmail: string | null;
  userDisplayName: string | null;
};

type Props = {
  initialItems: AuditLogItem[];
  initialTotal: number;
  initialPage: number;
  initialPageSize: number;
  initialTotalPages: number;
  initialDistinctActions: string[];
  wardId: string;
};

export function WardAuditLogClient({
  initialItems,
  initialTotal,
  initialPage,
  initialPageSize,
  initialTotalPages,
  initialDistinctActions,
  wardId
}: Props) {
  const [items, setItems] = useState<AuditLogItem[]>(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [distinctActions, setDistinctActions] = useState(initialDistinctActions);

  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageSize = initialPageSize;

  async function fetchPage(newPage: number, overrides?: {
    search?: string;
    action?: string;
    entityType?: string;
    severity?: string;
    source?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set('page', String(newPage));
    params.set('pageSize', String(pageSize));
    const s = overrides?.search ?? search;
    const a = overrides?.action ?? actionFilter;
    const et = overrides?.entityType ?? entityTypeFilter;
    const sev = overrides?.severity ?? severityFilter;
    const src = overrides?.source ?? sourceFilter;
    const df = overrides?.dateFrom ?? dateFrom;
    const dt = overrides?.dateTo ?? dateTo;

    if (s) params.set('search', s);
    if (a) params.set('action', a);
    if (et) params.set('entityType', et);
    if (sev) params.set('severity', sev);
    if (src) params.set('source', src);
    if (df) params.set('dateFrom', df);
    if (dt) params.set('dateTo', dt);

    try {
      const res = await fetch(`/api/w/${wardId}/audit-log?${params.toString()}`);
      if (!res.ok) {
        setError('Failed to load activity log.');
        return;
      }
      const data = await res.json();
      setItems(data.items);
      setTotal(data.total);
      setPage(data.page);
      setTotalPages(data.totalPages);
      if (data.distinctActions) {
        setDistinctActions(data.distinctActions);
      }
    } catch {
      setError('Failed to load activity log.');
    } finally {
      setLoading(false);
    }
  }

  function onSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      void fetchPage(1, { search: val });
    }, 300);
  }

  function onActionChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    setActionFilter(val);
    void fetchPage(1, { action: val });
  }

  function onEntityTypeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    setEntityTypeFilter(val);
    void fetchPage(1, { entityType: val });
  }

  function onSeverityChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    setSeverityFilter(val);
    void fetchPage(1, { severity: val });
  }

  function onSourceChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    setSourceFilter(val);
    void fetchPage(1, { source: val });
  }

  function onDateFromChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setDateFrom(val);
    void fetchPage(1, { dateFrom: val });
  }

  function onDateToChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setDateTo(val);
    void fetchPage(1, { dateTo: val });
  }

  function onClearFilters() {
    setSearch('');
    setActionFilter('');
    setEntityTypeFilter('');
    setSeverityFilter('');
    setSourceFilter('');
    setDateFrom('');
    setDateTo('');
    void fetchPage(1, { search: '', action: '', entityType: '', severity: '', source: '', dateFrom: '', dateTo: '' });
  }

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  const hasFilters = Boolean(search || actionFilter || entityTypeFilter || severityFilter || sourceFilter || dateFrom || dateTo);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="rounded-lg border bg-card p-4 space-y-3 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-medium text-muted-foreground">
            Search
            <input
              type="text"
              placeholder="Action, member, calling, user..."
              value={search}
              onChange={onSearchChange}
              className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm text-foreground"
            />
          </label>

          <label className="text-xs font-medium text-muted-foreground">
            Action
            <select
              value={actionFilter}
              onChange={onActionChange}
              className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm text-foreground"
            >
              <option value="">All Actions</option>
              {distinctActions.map((a) => (
                <option key={a} value={a}>
                  {actionLabel(a)}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-medium text-muted-foreground">
            Entity Type
            <select
              value={entityTypeFilter}
              onChange={onEntityTypeChange}
              className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm text-foreground"
            >
              <option value="">All Entity Types</option>
              <option value="calling">Calling</option>
              <option value="meeting">Meeting</option>
              <option value="program_item">Program Item</option>
              <option value="announcement">Announcement</option>
              <option value="member">Member</option>
              <option value="import">Import</option>
              <option value="user">User</option>
            </select>
          </label>

          <label className="text-xs font-medium text-muted-foreground">
            Severity
            <select
              value={severityFilter}
              onChange={onSeverityChange}
              className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm text-foreground"
            >
              <option value="">All Severities</option>
              <option value="info">Info</option>
              <option value="notice">Notice</option>
              <option value="security">Security</option>
            </select>
          </label>

          <label className="text-xs font-medium text-muted-foreground">
            Source
            <select
              value={sourceFilter}
              onChange={onSourceChange}
              className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm text-foreground"
            >
              <option value="">All Sources</option>
              <option value="manual_ui">Manual UI</option>
              <option value="lcr_import">LCR Import</option>
              <option value="bulk_sync">Bulk Sync</option>
              <option value="api">API</option>
            </select>
          </label>

          <label className="text-xs font-medium text-muted-foreground">
            From Date
            <input
              type="date"
              value={dateFrom}
              onChange={onDateFromChange}
              className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm text-foreground"
            />
          </label>

          <label className="text-xs font-medium text-muted-foreground">
            To Date
            <input
              type="date"
              value={dateTo}
              onChange={onDateToChange}
              className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm text-foreground"
            />
          </label>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{loading ? 'Loading...' : `Showing ${items.length} of ${total} entries`}</span>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={onClearFilters}>
              Clear Filters
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border bg-card text-card-foreground shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Timestamp</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actor</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Action & Entity</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Affected Member & Context</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Severity / Source</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Changes & Details</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item) => {
              const isExpanded = expandedId === item.id;
              const hasChanges = Boolean(item.changes && Object.keys(item.changes).length > 0);
              const hasDetails = Boolean(item.details && Object.keys(item.details).length > 0);

              return (
                <tr key={item.id} className="hover:bg-muted/30">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                    {formatDate(item.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">
                      {item.actorName || item.userDisplayName || item.userEmail || 'System'}
                    </div>
                    {item.userEmail && item.actorName && (
                      <div className="text-xs text-muted-foreground">{item.userEmail}</div>
                    )}
                    {item.isCrossWardSupport && (
                      <span className="mt-1 inline-flex items-center rounded bg-amber-100 px-1.5 py-0.2 text-[10px] font-semibold text-amber-900">
                        Cross-Ward Support
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${actionColor(item.action)}`}>
                        {actionLabel(item.action)}
                      </span>
                      {item.entityType && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground uppercase">
                          {item.entityType}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {item.targetMemberName ? (
                      <div>
                        <div className="font-medium text-foreground">{item.targetMemberName}</div>
                        {item.callingName && (
                          <div className="text-xs text-muted-foreground">
                            {item.organization ? `${item.organization} • ` : ''}
                            {item.callingName}
                            {item.callingStatus ? ` (${item.callingStatus})` : ''}
                          </div>
                        )}
                      </div>
                    ) : item.callingName ? (
                      <div>
                        <div className="font-medium text-foreground">{item.callingName}</div>
                        {item.organization && (
                          <div className="text-xs text-muted-foreground">{item.organization}</div>
                        )}
                      </div>
                    ) : item.meetingDate ? (
                      <div>
                        <div className="font-medium text-foreground">Meeting: {item.meetingDate}</div>
                        {item.itemTitle && (
                          <div className="text-xs text-muted-foreground">{item.itemType ? `${item.itemType}: ` : ''}{item.itemTitle}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <div>{severityBadge(item.severity)}</div>
                      <div>{sourceBadge(item.source)}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {(hasChanges || hasDetails) ? (
                      <div className="space-y-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setExpandedId(isExpanded ? null : item.id)}
                          className="text-xs"
                        >
                          {isExpanded ? 'Hide' : hasChanges ? 'View Changes' : 'View Details'}
                        </Button>
                        {isExpanded && (
                          <div className="mt-2 rounded-md border bg-muted/20 p-3 text-left shadow-inner">
                            {hasChanges && item.changes && (
                              <div className="mb-3 space-y-1.5">
                                <div className="text-xs font-semibold text-foreground uppercase tracking-wider">Field Changes:</div>
                                <div className="divide-y rounded border bg-background text-xs">
                                  <div className="grid grid-cols-3 bg-muted/40 p-1.5 font-medium text-muted-foreground">
                                    <div>Field</div>
                                    <div>Old Value</div>
                                    <div>New Value</div>
                                  </div>
                                  {Object.entries(item.changes).map(([field, diff]) => (
                                    <div key={field} className="grid grid-cols-3 p-1.5">
                                      <div className="font-mono font-medium text-foreground">{field}</div>
                                      <div className="text-red-700 bg-red-50/50 p-0.5 rounded">{formatValue(diff.old)}</div>
                                      <div className="text-green-700 bg-green-50/50 p-0.5 rounded">{formatValue(diff.new)}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {hasDetails && (
                              <div>
                                <div className="text-xs font-semibold text-foreground uppercase tracking-wider mb-1">Details Payload:</div>
                                <pre className="max-h-48 overflow-auto rounded bg-slate-900 p-2 font-mono text-[11px] text-slate-100">
                                  {JSON.stringify(item.details, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  {loading ? 'Loading activity log entries...' : 'No activity log entries match the current filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => void fetchPage(page - 1)}
          >
            &larr; Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => void fetchPage(page + 1)}
          >
            Next &rarr;
          </Button>
        </div>
      )}
    </div>
  );
}
