'use client';

import { useEffect, useRef, useState } from 'react';

type Hymn = {
  id: string;
  hymnNumber: string;
  title: string;
  book: string;
};

type HymnAutocompleteProps = {
  hymnNumber: string;
  hymnTitle: string;
  onChange: (hymnNumber: string, hymnTitle: string) => void;
};

function hymnLabel(hymn: Hymn): string {
  return `${hymn.hymnNumber} — ${hymn.title}`;
}

function bookBadge(book: string): string {
  if (book === 'NEW') return 'New';
  if (book === 'CHILDRENS') return "Children's";
  return '';
}

function buildDisplayValue(hymnNumber: string, hymnTitle: string): string {
  if (hymnNumber && hymnTitle) return `${hymnNumber} — ${hymnTitle}`;
  if (hymnTitle) return hymnTitle;
  return '';
}

export function HymnAutocomplete({ hymnNumber, hymnTitle, onChange }: HymnAutocompleteProps) {
  const [hymns, setHymns] = useState<Hymn[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const ignoreNextBlur = useRef(false);

  useEffect(() => {
    fetch('/api/hymns')
      .then((r) => r.json())
      .then((data: { hymns: Hymn[] }) => {
        setHymns(data.hymns);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    setInputValue(buildDisplayValue(hymnNumber, hymnTitle));
  }, [hymnNumber, hymnTitle]);

  const filtered = (() => {
    const q = inputValue.trim().toLowerCase();
    if (!q) return hymns.slice(0, 30);
    return hymns
      .filter((h) => {
        const combined = `${h.hymnNumber} ${h.title}`.toLowerCase();
        return combined.includes(q);
      })
      .slice(0, 30);
  })();

  function selectHymn(hymn: Hymn) {
    ignoreNextBlur.current = true;
    const label = hymnLabel(hymn);
    setInputValue(label);
    setOpen(false);
    onChange(hymn.hymnNumber, hymn.title);
  }

  function handleInputChange(value: string) {
    setInputValue(value);
    setOpen(true);
  }

  function handleBlur() {
    if (ignoreNextBlur.current) {
      ignoreNextBlur.current = false;
      return;
    }
    setOpen(false);

    const trimmed = inputValue.trim();
    // Try exact match first
    const exact = hymns.find((h) => hymnLabel(h).toLowerCase() === trimmed.toLowerCase());
    if (exact) {
      onChange(exact.hymnNumber, exact.title);
      return;
    }
    // Free-text: store as title only
    onChange('', trimmed);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        className="w-full rounded-md border px-3 py-2 text-sm"
        value={inputValue}
        placeholder={loading ? 'Loading hymns…' : 'Search by number or title, or type freely…'}
        disabled={loading}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />

      {open && !loading && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-white shadow-lg dark:bg-zinc-900">
          {filtered.map((hymn) => {
            const badge = bookBadge(hymn.book);
            return (
              <li
                key={hymn.id}
                className="flex cursor-pointer items-baseline gap-2 px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                onMouseDown={() => selectHymn(hymn)}
              >
                <span className="font-medium tabular-nums">{hymn.hymnNumber}</span>
                <span className="flex-1">{hymn.title}</span>
                {badge ? (
                  <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
                    {badge}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
