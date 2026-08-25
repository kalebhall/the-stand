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

export type AuditLogItem = {
  id: string;
  userId: string | null;
  action: string;
  details: Record<string, unknown> | null;
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
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [distinctActions, setDistinctActions] = useState(initialDistinctActions);

  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageSize = initialPageSize;

  async function fetchPage(newPage: number, overrides?: { search?: string; action?: string; dateFrom?: string; dateTo?: string }) {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set('page', String(newPage));
    params.set('pageSize', String(pageSize));
    const s = overrides?.search ?? search;
    const a = overrides?.action ?? actionFilter;
    const df = overrides?.dateFrom ?? dateFrom;
    const dt = overrides?.dateTo ?? dateTo;
    if (s) params.set('search', s);
    if (a) params.set('action', a);
    if (df) params.set('dateFrom', df);
    if (dt) params.set('dateTo', dt);

    try {
      const res = await fetch(`/api/w/${wardId}/audit-log?${params.toString()}`);
      if (!res.ok) {
        setError('Failed to load activity log.');
        return;
      }
      const data = (await res.json()) as {
        items: AuditLogItem[];
        total: number;
        page: number;
        totalPages: number;
        distinctActions: string[];
      };
      setItems(data.items);
      setTotal(data.total);
      setPage(data.page);
      setTotalPages(data.totalPages);
      if (data.distinctActions.length > 0) setDistinctActions(data.distinctActions);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      void fetchPage(1, { search: value });
    }, 400);
  }

  function handleFilterChange(field: 'action' | 'dateFrom' | 'dateTo', value: string) {
    if (field === 'action') setActionFilter(value);
    if (field === 'dateFrom') setDateFrom(value);
    if (field === 'dateTo') setDateTo(value);
    void fetchPage(1, {
      action: field === 'action' ? value : actionFilter,
      dateFrom: field === 'dateFrom' ? value : dateFrom,
      dateTo: field === 'dateTo' ? value : dateTo
    });
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          placeholder="Search actions, users, details…"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="h-9 w-full max-w-xs rounded-md border bg-background px-3 text-sm"
        />
        <select
          value={actionFilter}
          onChange={(e) => handleFilterChange('action', e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          <option value="">All actions</option>
          {distinctActions.map((a) => (
            <option key={a} value={a}>{actionLabel(a)}</option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => handleFilterChange('dateTo', e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        />
      </div>

      <div className="text-sm text-muted-foreground">
        {loading ? 'Loading…' : `${total.toLocaleString()} entries`}
        {(search || actionFilter || dateFrom || dateTo) ? ' (filtered)' : ''}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {/* Entries */}
      <div className="space-y-2">
        {items.length === 0 && !loading ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            No activity found.
          </div>
        ) : (
          items.map((item) => (
            <article key={item.id} className="rounded-md border bg-card p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="rounded-full border px-2 py-0.5 text-xs font-medium">
                      {actionLabel(item.action)}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {item.userDisplayName ?? item.userEmail ?? 'System'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</p>
                </div>
                {item.details ? (
                  <button
                    type="button"
                    onClick={() => toggleExpand(item.id)}
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    {expandedIds.has(item.id) ? 'Hide details' : 'Show details'}
                  </button>
                ) : null}
              </div>
              {expandedIds.has(item.id) && item.details ? (
                <pre className="mt-2 overflow-x-auto rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                  {JSON.stringify(item.details, null, 2)}
                </pre>
              ) : null}
            </article>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => void fetchPage(page - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => void fetchPage(page + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
