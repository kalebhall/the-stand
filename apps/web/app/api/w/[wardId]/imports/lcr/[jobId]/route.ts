import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canViewCallings } from '@/src/auth/roles';
import { getLcrImportJob } from '@/src/imports/lcr-jobs';

export async function GET(_request: Request, context: { params: Promise<{ wardId: string; jobId: string }> }) {
  const session = await auth().catch(() => null);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId, jobId } = await context.params;
  if (!canViewCallings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  const job = getLcrImportJob<unknown>(jobId);
  if (!job || job.wardId !== wardId || job.userId !== session.user.id) {
    return NextResponse.json({ error: 'Job not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  if (job.state === 'failed') {
    return NextResponse.json(
      {
        state: job.state,
        error: job.error ?? 'LCR import failed',
        code: 'IMPORT_FAILED'
      },
      { status: 422 }
    );
  }

  return NextResponse.json({
    state: job.state,
    result: job.state === 'succeeded' ? job.result : null
  });
}
