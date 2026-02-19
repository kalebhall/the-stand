import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { auth } from '@/src/auth/auth';
import { hasRole } from '@/src/auth/roles';
import { pool } from '@/src/db/client';

type HymnRow = {
  id: string;
  hymn_number: string;
  title: string;
  book: string;
  sort_key: number;
  is_active: boolean;
};

const VALID_BOOKS = ['STANDARD', 'NEW', 'CHILDRENS'] as const;
type Book = (typeof VALID_BOOKS)[number];

const BOOK_LABELS: Record<Book, string> = {
  STANDARD: 'Standard (1985)',
  NEW: 'New Hymnbook',
  CHILDRENS: "Children's Songbook"
};

async function requireSupportAdmin() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  if (!hasRole(session.user.roles, 'SUPPORT_ADMIN')) redirect('/dashboard');
  return session;
}

export default async function SupportHymnsPage({ searchParams }: { searchParams: Promise<{ book?: string; q?: string }> }) {
  await requireSupportAdmin();

  const { book: bookFilter, q: query } = await searchParams;
  const activeBook = VALID_BOOKS.includes(bookFilter as Book) ? (bookFilter as Book) : null;

  async function addHymn(formData: FormData) {
    'use server';
    await requireSupportAdmin();

    const hymnNumber = String(formData.get('hymnNumber') ?? '').trim();
    const title = String(formData.get('title') ?? '').trim();
    const book = String(formData.get('book') ?? '').trim();
    const sortKeyRaw = parseInt(String(formData.get('sortKey') ?? ''), 10);

    if (!hymnNumber || !title || !VALID_BOOKS.includes(book as Book) || isNaN(sortKeyRaw)) return;

    await pool.query(
      `INSERT INTO hymn (hymn_number, title, book, sort_key) VALUES ($1, $2, $3, $4)`,
      [hymnNumber, title, book, sortKeyRaw]
    );
    revalidatePath('/support/hymns');
  }

  async function updateHymn(formData: FormData) {
    'use server';
    await requireSupportAdmin();

    const id = String(formData.get('id') ?? '').trim();
    const hymnNumber = String(formData.get('hymnNumber') ?? '').trim();
    const title = String(formData.get('title') ?? '').trim();
    const book = String(formData.get('book') ?? '').trim();
    const sortKeyRaw = parseInt(String(formData.get('sortKey') ?? ''), 10);
    const isActive = formData.get('isActive') === '1';

    if (!id || !hymnNumber || !title || !VALID_BOOKS.includes(book as Book) || isNaN(sortKeyRaw)) return;

    await pool.query(
      `UPDATE hymn SET hymn_number=$1, title=$2, book=$3, sort_key=$4, is_active=$5, updated_at=now() WHERE id=$6`,
      [hymnNumber, title, book, sortKeyRaw, isActive, id]
    );
    revalidatePath('/support/hymns');
  }

  async function deleteHymn(formData: FormData) {
    'use server';
    await requireSupportAdmin();

    const id = String(formData.get('id') ?? '').trim();
    if (!id) return;

    await pool.query(`DELETE FROM hymn WHERE id = $1`, [id]);
    revalidatePath('/support/hymns');
  }

  let queryStr = `SELECT id, hymn_number, title, book, sort_key, is_active FROM hymn`;
  const params: (string | number)[] = [];
  const conditions: string[] = [];

  if (activeBook) {
    params.push(activeBook);
    conditions.push(`book = $${params.length}`);
  }

  if (query?.trim()) {
    params.push(`%${query.trim()}%`);
    conditions.push(`(hymn_number ILIKE $${params.length} OR title ILIKE $${params.length})`);
  }

  if (conditions.length) queryStr += ` WHERE ${conditions.join(' AND ')}`;
  queryStr += ` ORDER BY sort_key ASC`;

  const result = await pool.query(queryStr, params);
  const hymns = result.rows as HymnRow[];

  const nextSortKey = (() => {
    if (activeBook === 'NEW') return 10000 + hymns.filter((h) => h.book === 'NEW').length + 1;
    if (activeBook === 'CHILDRENS') return 20000 + hymns.filter((h) => h.book === 'CHILDRENS').length + 1;
    return hymns.filter((h) => h.book === 'STANDARD').length + 1;
  })();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 p-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold">Support Console: Hymn Library</h1>
        <p className="text-muted-foreground">
          Manage the global hymn list used in the meeting program autocomplete. All wards share this list.
        </p>
        <Link href="/support" className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}>
          Back to support sections
        </Link>
      </section>

      {/* Filters */}
      <form method="GET" className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={query ?? ''}
          placeholder="Search…"
          className="rounded-md border px-3 py-2 text-sm"
        />
        <select name="book" defaultValue={bookFilter ?? ''} className="rounded-md border px-3 py-2 text-sm">
          <option value="">All books</option>
          {VALID_BOOKS.map((b) => (
            <option key={b} value={b}>
              {BOOK_LABELS[b]}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-md border px-3 py-2 text-sm font-medium">
          Filter
        </button>
        <Link href="/support/hymns" className="rounded-md border px-3 py-2 text-sm font-medium">
          Clear
        </Link>
      </form>

      {/* Add new hymn */}
      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 font-semibold">Add hymn</h2>
        <form action={addHymn} className="grid gap-3 sm:grid-cols-[auto_1fr_auto_auto_auto]">
          <input
            name="hymnNumber"
            required
            placeholder="Number (e.g. 30, C1, N1)"
            className="rounded-md border px-3 py-2 text-sm"
          />
          <input
            name="title"
            required
            placeholder="Title"
            className="rounded-md border px-3 py-2 text-sm"
          />
          <select name="book" required className="rounded-md border px-3 py-2 text-sm">
            {VALID_BOOKS.map((b) => (
              <option key={b} value={b}>
                {BOOK_LABELS[b]}
              </option>
            ))}
          </select>
          <input
            name="sortKey"
            type="number"
            required
            defaultValue={nextSortKey}
            placeholder="Sort key"
            className="w-24 rounded-md border px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded-md border bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
            Add
          </button>
        </form>
      </section>

      {/* Hymn list */}
      <section className="space-y-2">
        <p className="text-sm text-muted-foreground">{hymns.length} hymn{hymns.length !== 1 ? 's' : ''} shown</p>
        {hymns.length === 0 ? (
          <p className="text-muted-foreground">No hymns match the current filter.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium">Number</th>
                  <th className="px-3 py-2 text-left font-medium">Title</th>
                  <th className="px-3 py-2 text-left font-medium">Book</th>
                  <th className="px-3 py-2 text-left font-medium">Sort</th>
                  <th className="px-3 py-2 text-left font-medium">Active</th>
                  <th className="px-3 py-2 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {hymns.map((hymn) => (
                  <tr key={hymn.id} className={`border-b last:border-0 ${!hymn.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-2 font-mono">{hymn.hymn_number}</td>
                    <td className="px-3 py-2">{hymn.title}</td>
                    <td className="px-3 py-2 text-muted-foreground">{BOOK_LABELS[hymn.book as Book] ?? hymn.book}</td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{hymn.sort_key}</td>
                    <td className="px-3 py-2">{hymn.is_active ? 'Yes' : 'No'}</td>
                    <td className="px-3 py-2">
                      <details className="group">
                        <summary className="cursor-pointer text-xs underline underline-offset-2">Edit</summary>
                        <form action={updateHymn} className="mt-2 flex flex-wrap gap-2">
                          <input type="hidden" name="id" value={hymn.id} />
                          <input
                            name="hymnNumber"
                            defaultValue={hymn.hymn_number}
                            required
                            className="w-20 rounded-md border px-2 py-1 text-xs"
                          />
                          <input
                            name="title"
                            defaultValue={hymn.title}
                            required
                            className="min-w-40 flex-1 rounded-md border px-2 py-1 text-xs"
                          />
                          <select name="book" defaultValue={hymn.book} className="rounded-md border px-2 py-1 text-xs">
                            {VALID_BOOKS.map((b) => (
                              <option key={b} value={b}>
                                {b}
                              </option>
                            ))}
                          </select>
                          <input
                            name="sortKey"
                            type="number"
                            defaultValue={hymn.sort_key}
                            required
                            className="w-20 rounded-md border px-2 py-1 text-xs"
                          />
                          <label className="flex items-center gap-1 text-xs">
                            <input type="hidden" name="isActive" value="0" />
                            <input
                              type="checkbox"
                              name="isActive"
                              value="1"
                              defaultChecked={hymn.is_active}
                            />
                            Active
                          </label>
                          <button type="submit" className="rounded-md border px-2 py-1 text-xs font-medium">
                            Save
                          </button>
                        </form>
                        <form action={deleteHymn} className="mt-1">
                          <input type="hidden" name="id" value={hymn.id} />
                          <button
                            type="submit"
                            className="text-xs text-red-600 underline underline-offset-2"
                          >
                            Delete
                          </button>
                        </form>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
