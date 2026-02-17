'use client';

import { useEffect, useRef, useState } from 'react';

type CallingAutocompleteProps = {
  standardCallings: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  name?: string;
};

export function CallingAutocomplete({
  standardCallings,
  value,
  onChange,
  placeholder,
  className,
  required,
  name,
}: CallingAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered =
    value.trim() === ''
      ? standardCallings
      : standardCallings.filter((c) => c.toLowerCase().includes(value.toLowerCase()));

  function handleFocus() {
    setOpen(true);
    setActiveIndex(-1);
  }

  function handleBlur(event: React.FocusEvent) {
    if (containerRef.current?.contains(event.relatedTarget as Node)) return;
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (!open) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (event.key === 'Enter') {
      if (activeIndex >= 0 && filtered[activeIndex]) {
        event.preventDefault();
        onChange(filtered[activeIndex]);
        setOpen(false);
        setActiveIndex(-1);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

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
        name={name}
        required={required}
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
        aria-autocomplete="list"
        aria-expanded={showDropdown}
      />
      {showDropdown ? (
        <ul
          ref={listRef}
          className="absolute z-50 mt-1 max-h-52 w-full overflow-auto rounded-md border bg-popover text-sm shadow-md"
          role="listbox"
        >
          {filtered.map((calling, index) => (
            <li
              key={calling}
              role="option"
              aria-selected={index === activeIndex}
              className={`cursor-pointer px-3 py-2 ${
                index === activeIndex
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent hover:text-accent-foreground'
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(calling);
                setOpen(false);
                setActiveIndex(-1);
              }}
            >
              {calling}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
