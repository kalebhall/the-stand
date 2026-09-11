import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center gap-6 p-6 text-center">
      <section className="space-y-2">
        <p className="text-6xl font-semibold tracking-tight">404</p>
        <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-muted-foreground">This page could not be found.</p>
      </section>
      <div className="flex flex-wrap justify-center gap-3">
        <Link className={cn(buttonVariants())} href="/">
          Return home
        </Link>
        <Link className={cn(buttonVariants({ variant: 'outline' }))} href="/login">
          Log in
        </Link>
      </div>
    </main>
  );
}
