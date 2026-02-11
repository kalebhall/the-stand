import './globals.css';

import type { ReactNode } from 'react';

import { ensureSupportAdminBootstrap } from '@/src/db/bootstrap-support-admin';

export default async function RootLayout({ children }: { children: ReactNode }) {
  await ensureSupportAdminBootstrap();

  return (
    <html lang="en">
      <body className="bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
