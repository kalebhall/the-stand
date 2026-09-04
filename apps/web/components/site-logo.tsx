import Link from 'next/link';
import type { ComponentPropsWithoutRef } from 'react';

function ChapelMark({ className, ...props }: ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M24 4 29 10h-3v5h-4v-5h-3l5-6Z" fill="currentColor" />
      <path d="M21 15h6v5h-6zM17 20h14l8 7v14H9V27l8-7Z" fill="currentColor" />
      <path d="M13 27h22v10H13V27Z" fill="currentColor" opacity=".22" />
      <path d="M20 41V30h8v11h-8Z" fill="currentColor" />
      <path d="M15 28h4v5h-4zM29 28h4v5h-4z" fill="currentColor" opacity=".9" />
    </svg>
  );
}

export function SiteLogo({
  className,
  iconClassName,
  showName = true
}: {
  className?: string;
  iconClassName?: string;
  showName?: boolean;
}) {
  return (
    <Link href="/dashboard" className={`flex items-center gap-2 font-bold tracking-tight text-primary ${className ?? ''}`}>
      <ChapelMark className={`h-7 w-7 shrink-0 ${iconClassName ?? ''}`} />
      {showName ? <span>The Stand</span> : <span className="sr-only">The Stand</span>}
    </Link>
  );
}

export { ChapelMark };
