import { NextResponse } from 'next/server';

import { auth } from '@/src/auth/auth';
import { canManageMeetings } from '@/src/auth/roles';
import { refreshCalendarFeedsForWard } from '@/src/calendar/service';

export async function POST(_: Request, context: { params: Promise<{ wardId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { wardId } = await context.params;
  if (!canManageMeetings({ roles: session.user.roles, activeWardId: session.activeWardId }, wardId)) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  }

  try {
    const summary = await refreshCalendarFeedsForWard({ wardId, userId: session.user.id, reason: 'manual' });
    return NextResponse.json({ refreshedFeeds: summary.length, summary });
  } catch {
    return NextResponse.json({ error: 'Failed to refresh calendar feeds', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
