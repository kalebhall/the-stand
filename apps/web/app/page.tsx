import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-3xl font-semibold">The Stand</h1>
      <p className="text-muted-foreground">Landing page placeholder for Phase 0 repo foundation.</p>
      <div className="flex flex-wrap gap-3">
        <Link className={cn(buttonVariants())} href="/login">
          Login
        </Link>
        <Link className={cn(buttonVariants({ variant: 'outline' }))} href="/request-access">
          Request Access
        </Link>
      </div>
    </main>
  );
}
