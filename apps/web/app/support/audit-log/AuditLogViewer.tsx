'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';

export type AuditLogEntry = {
  id: string;
  wardId: string | null;
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
  wardName: string | null;
};

type SortColumn = 'created_at' | 'action' | 'user_email' | 'ward_name' | 'entity_type' | 'severity' | 'source' | 'target_member_name';
type SortDir = 'ASC' | 'DESC';

type Props = {
  initialItems: AuditLogEntry[];
  initialTotal: number;
  initialPage: number;
  initialPageSize: number;
  initialTotalPages: number;
  distinctActions: string[];
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatAction(action: string): string {
  return action.replace(/_/g, ' ');
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

export default function AuditLogViewer({
  initialItems,
  initialTotal,
  initialPage,
  initialPageSize,
  initialTotalPages,
  distinctActions
}: Props) {
  const [items, setItems] = useState<AuditLogEntry[]>(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [pageSize] = useState(initialPageSize);
  const [totalPages, setTotalPages] = useState(initialTotalPages);

  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [sortColumn, setSortColumn] = useState<SortColumn>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('DESC');

  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const buildQueryString = useCallback(
    (p: number) => {
      const params = new URLSearchParams();
      params.set('page', String(p));
      params.set('pageSize', String(pageSize));
      params.set('sort', sortColumn);
      params.set('dir', sortDir);

      if (search) params.set('search', search);
      if (actionFilter) params.set('action', actionFilter);
      if (entityTypeFilter) params.set('entityType', entityTypeFilter);
      if (severityFilter) params.set('severity', severityFilter);
      if (sourceFilter) params.set('source', sourceFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      return params.toString();
    },
    [pageSize, sortColumn, sortDir, search, actionFilter, entityTypeFilter, severityFilter, sourceFilter, dateFrom, dateTo]
  );

  const fetchData = useCallback(
    async (p: number) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/support/audit-log?${buildQueryString(p)}`);
        if (!res.ok) return;
        const data = await res.json();
        setItems(data.items);
        setTotal(data.total);
        setPage(data.page);
        setTotalPages(data.totalPages);
      } finally {
        setLoading(false);
      }
    },
    [buildQueryString]
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      void fetchData(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, actionFilter, entityTypeFilter, severityFilter, sourceFilter, dateFrom, dateTo, sortColumn, sortDir, fetchData]);

  const handleSort = useCallback(
    (col: SortColumn) => {
      if (sortColumn === col) {
        setSortDir((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'));
      } else {
        setSortColumn(col);
        setSortDir(col === 'created_at' ? 'DESC' : 'ASC');
      }
    },
    [sortColumn]
  );

  const sortIndicator = useCallback(
    (col: SortColumn) => {
      if (sortColumn !== col) return '';
      return sortDir === 'ASC' ? ' \u2191' : ' \u2193';
    },
    [sortColumn, sortDir]
  );

  const handleClearFilters = useCallback(() => {
    setSearch('');
    setActionFilter('');
    setEntityTypeFilter('');
    setSeverityFilter('');
    setSourceFilter('');
    setDateFrom('');
    setDateTo('');
    setSortColumn('created_at');
    setSortDir('DESC');
  }, []);

  const hasActiveFilters = useMemo(
    () => Boolean(search || actionFilter || entityTypeFilter || severityFilter || sourceFilter || dateFrom || dateTo),
    [search, actionFilter, entityTypeFilter, severityFilter, sourceFilter, dateFrom, dateTo]
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <section className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-medium text-muted-foreground">
            Search
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Action, member, calling, user, details..."
              className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm text-foreground"
            />
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Action
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm text-foreground"
            >
              <option value="">All actions</option>
              {distinctActions.map((a) => (
                <option key={a} value={a}>
                  {formatAction(a)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Entity Type
            <select
              value={entityTypeFilter}
              onChange={(e) => setEntityTypeFilter(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm text-foreground"
            >
              <option value="">All entity types</option>
              <option value="calling">Calling</option>
              <option value="meeting">Meeting</option>
              <option value="program_item">Program Item</option>
              <option value="announcement">Announcement</option>
              <option value="member">Member</option>
              <option value="import">Import</option>
              <option value="user">User</option>
              <option value="support_grant">Support Grant</option>
            </select>
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Severity
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm text-foreground"
            >
              <option value="">All severities</option>
              <option value="info">Info</option>
              <option value="notice">Notice</option>
              <option value="security">Security</option>
            </select>
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Source
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm text-foreground"
            >
              <option value="">All sources</option>
              <option value="manual_ui">Manual UI</option>
              <option value="lcr_import">LCR Import</option>
              <option value="bulk_sync">Bulk Sync</option>
              <option value="api">API</option>
            </select>
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            From date
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm text-foreground"
            />
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            To date
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm text-foreground"
            />
          </label>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {loading ? 'Loading...' : `Showing ${items.length} of ${total} entries`}
          </p>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={handleClearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      </section>

      {/* Table */}
      <section className="overflow-x-auto rounded-lg border bg-card text-card-foreground shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th
                className="cursor-pointer px-4 py-3 text-left font-medium text-muted-foreground hover:text-foreground"
                onClick={() => handleSort('created_at')}
              >
                Timestamp{sortIndicator('created_at')}
              </th>
              <th
                className="cursor-pointer px-4 py-3 text-left font-medium text-muted-foreground hover:text-foreground"
                onClick={() => handleSort('user_email')}
              >
                Actor{sortIndicator('user_email')}
              </th>
              <th
                className="cursor-pointer px-4 py-3 text-left font-medium text-muted-foreground hover:text-foreground"
                onClick={() => handleSort('ward_name')}
              >
                Ward{sortIndicator('ward_name')}
              </th>
              <th
                className="cursor-pointer px-4 py-3 text-left font-medium text-muted-foreground hover:text-foreground"
                onClick={() => handleSort('action')}
              >
                Action & Entity{sortIndicator('action')}
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Affected Member & Context
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Severity / Source
              </th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                Changes & Details
              </th>
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
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                    {item.wardName || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${actionColor(item.action)}`}>
                        {formatAction(item.action)}
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
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  {loading ? 'Loading audit log entries...' : 'No audit log entries match the current filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Pagination */}
      {totalPages > 1 && (
        <section className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => void fetchData(page - 1)}
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
            onClick={() => void fetchData(page + 1)}
          >
            Next &rarr;
          </Button>
        </section>
      )}
    </div>
  );
}
