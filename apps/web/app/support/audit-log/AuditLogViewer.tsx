'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';

export type AuditLogEntry = {
  id: string;
  wardId: string | null;
  userId: string | null;
  action: string;
  details: Record<string, unknown> | null;
  createdAt: string;
  userEmail: string | null;
  userDisplayName: string | null;
  wardName: string | null;
};

type SortColumn = 'created_at' | 'action' | 'user_email' | 'ward_name';
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

function actionColor(action: string): string {
  if (action.includes('DELETE') || action.includes('REVOKE') || action.includes('DEACTIVAT')) {
    return 'bg-red-100 text-red-800';
  }
  if (action.includes('CREATE') || action.includes('ASSIGN') || action.includes('BOOTSTRAP') || action.includes('IMPORT')) {
    return 'bg-green-100 text-green-800';
  }
  if (action.includes('UPDATE') || action.includes('PUBLISH') || action.includes('REPUBLISH')) {
    return 'bg-blue-100 text-blue-800';
  }
  if (action.includes('VIEW')) {
    return 'bg-slate-100 text-slate-700';
  }
  return 'bg-yellow-100 text-yellow-800';
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
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      return params.toString();
    },
    [pageSize, sortColumn, sortDir, search, actionFilter, dateFrom, dateTo]
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

  // Refetch when filters or sort changes
  useEffect(() => {
    const timeout = setTimeout(() => {
      void fetchData(1);
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, actionFilter, dateFrom, dateTo, sortColumn, sortDir]);

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
    setDateFrom('');
    setDateTo('');
    setSortColumn('created_at');
    setSortDir('DESC');
  }, []);

  const hasActiveFilters = useMemo(
    () => Boolean(search || actionFilter || dateFrom || dateTo),
    [search, actionFilter, dateFrom, dateTo]
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <section className="rounded-lg border bg-card p-4 text-card-foreground">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-muted-foreground">
            Search
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Action, user, ward, details..."
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Action
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground"
            >
              <option value="">All actions</option>
              {distinctActions.map((a) => (
                <option key={a} value={a}>
                  {formatAction(a)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            From date
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            To date
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-foreground"
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
      <section className="overflow-x-auto rounded-lg border bg-card text-card-foreground">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50/50">
              <th
                className="cursor-pointer px-4 py-3 text-left font-medium text-muted-foreground hover:text-foreground"
                onClick={() => handleSort('created_at')}
              >
                Timestamp{sortIndicator('created_at')}
              </th>
              <th
                className="cursor-pointer px-4 py-3 text-left font-medium text-muted-foreground hover:text-foreground"
                onClick={() => handleSort('action')}
              >
                Action{sortIndicator('action')}
              </th>
              <th
                className="cursor-pointer px-4 py-3 text-left font-medium text-muted-foreground hover:text-foreground"
                onClick={() => handleSort('user_email')}
              >
                User{sortIndicator('user_email')}
              </th>
              <th
                className="cursor-pointer px-4 py-3 text-left font-medium text-muted-foreground hover:text-foreground"
                onClick={() => handleSort('ward_name')}
              >
                Ward{sortIndicator('ward_name')}
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Details</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  {loading ? 'Loading audit log entries...' : 'No audit log entries match the current filters.'}
                </td>
              </tr>
            )}
            {items.map((entry) => {
              const isExpanded = expandedId === entry.id;
              return (
                <tr
                  key={entry.id}
                  className="border-b last:border-b-0 hover:bg-slate-50/50"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                    {formatDate(entry.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${actionColor(entry.action)}`}>
                      {formatAction(entry.action)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm">{entry.userDisplayName ?? entry.userEmail ?? 'System'}</span>
                    {entry.userDisplayName && entry.userEmail && (
                      <span className="block text-xs text-muted-foreground">{entry.userEmail}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {entry.wardName ?? <span className="italic">Global</span>}
                  </td>
                  <td className="px-4 py-3">
                    {entry.details ? (
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                        className="rounded px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
                      >
                        {isExpanded ? 'Hide' : 'View'}
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">&mdash;</span>
                    )}
                    {isExpanded && entry.details && (
                      <pre className="mt-2 max-w-md overflow-auto rounded bg-slate-100 p-2 text-xs text-slate-800">
                        {JSON.stringify(entry.details, null, 2)}
                      </pre>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Pagination */}
      {totalPages > 1 && (
        <section className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => void fetchData(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => void fetchData(page + 1)}
            >
              Next
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
