'use client';

import { useEffect, useRef, useState } from 'react';

type Member = {
  id: string;
  fullName: string;
};

type MemberAutocompleteProps = {
  wardId: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

export function MemberAutocomplete({ wardId, value, onChange, placeholder, className }: MemberAutocompleteProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = members.filter((m) => value.trim() === '' || m.fullName.toLowerCase().includes(value.toLowerCase()));

  async function fetchMembers(query: string) {
    setLoading(true);
    try {
      const search = query.trim();
      const params = new URLSearchParams({ limit: '50' });
      if (search) params.set('q', search);
      const res = await fetch(`/api/w/${wardId}/members?${params.toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as { members: Member[] };
      setMembers(data.members);
    } catch {
      // silently ignore fetch errors
    } finally {
      setLoading(false);
    }
  }

  function handleFocus() {
    void fetchMembers(value);
    setOpen(true);
    setActiveIndex(-1);
  }

  function handleBlur(event: React.FocusEvent) {
    if (containerRef.current?.contains(event.relatedTarget as Node)) return;
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (!open || filtered.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (event.key === 'Enter') {
      if (activeIndex >= 0 && filtered[activeIndex]) {
        event.preventDefault();
        onChange(filtered[activeIndex].fullName);
        setOpen(false);
        setActiveIndex(-1);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  useEffect(() => {
    if (!open) return;
    const timeout = setTimeout(() => {
      void fetchMembers(value);
    }, 200);

    return () => clearTimeout(timeout);
  }, [value, wardId, open]);

  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const item = listRef.current.children[activeIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const showDropdown = open && filtered.length > 0;

  return (
    <div ref={containerRef} className="relative" onBlur={handleBlur}>
      <input
        className={className}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setActiveIndex(-1);
          if (!open) setOpen(true);
        }}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
      />
      {showDropdown ? (
        <ul
          ref={listRef}
          className="absolute z-50 mt-1 max-h-52 w-full overflow-auto rounded-md border bg-popover text-sm shadow-md"
          role="listbox"
        >
          {filtered.map((member, index) => (
            <li
              key={member.id}
              role="option"
              aria-selected={index === activeIndex}
              className={`cursor-pointer px-3 py-2 ${index === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent hover:text-accent-foreground'}`}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(member.fullName);
                setOpen(false);
                setActiveIndex(-1);
              }}
            >
              {member.fullName}
            </li>
          ))}
        </ul>
      ) : null}
      {open && loading ? <p className="mt-1 text-xs text-muted-foreground">Loading members…</p> : null}
    </div>
  );
}
