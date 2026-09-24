import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { enforcePasswordRotation, requireAuthenticatedSession } from '@/src/platform/auth/session';
import { canManageMeetings, canViewCallings, canViewMeetings, hasRole } from '@/src/platform/permissions';
import { pool } from '@/src/db/client';
import { createWardContext } from '@/src/platform/tenancy/context';
import { getWardModuleSettings } from '@/src/modules/service';
import { createModuleEnablement } from '@/src/modules/enablement';
import { getDashboardModuleVisibility } from '@/src/dashboard/visibility';
import { setDbContext } from '@/src/platform/db/context';
import { DashboardGrid, type DashboardCardData } from '@/components/dashboard/dashboard-grid';

export default async function DashboardPage() {
  const session = await requireAuthenticatedSession();
  const t = await getTranslations('dashboard');
  enforcePasswordRotation(session);

  const wardContext = session.activeWardId ? createWardContext(session, session.activeWardId) : null;
  const wardSession = wardContext ? { roles: session.user.roles, activeWardId: wardContext.wardId } : null;
  const moduleSettings = wardContext ? await getWardModuleSettings(wardContext.wardId, session.user.id) : [];
  const moduleEnablement = createModuleEnablement(
    wardContext
      ? { [wardContext.wardId]: Object.fromEntries(moduleSettings.map((module) => [module.id, module.enabled])) }
      : {}
  );
  const dashboardModules = getDashboardModuleVisibility(
    wardContext?.wardId ?? '',
    moduleEnablement,
    wardSession ? canViewMeetings(wardSession, session.activeWardId!) : false,
    wardSession ? canViewCallings(wardSession, session.activeWardId!) : false,
    wardSession ? canManageMeetings(wardSession, session.activeWardId!) : false,
    session.user.roles?.includes('SUPPORT_ADMIN') ?? false
  );
  const canAccessMeetings = dashboardModules.meetings;
  const canAccessMembership = dashboardModules.membership;
  const canAccessCallings = dashboardModules.callings;
  const canAccessTechnology = dashboardModules.technology;
  const canAccessPortal = Boolean(session.activeWardId) && hasRole(session.user.roles, 'STAND_ADMIN');
  const showSupportCards = dashboardModules.support;
  let setApartQueueCount = 'Unavailable';
  let membershipActionQueueCount = 'Unavailable';
  let actionInterviewQueueCount = 'Unavailable';
  let overdueActionCount = 'Unavailable';
  let lcrFollowUpCount = 'Unavailable';
  let priesthoodPreparationCount = 'Unavailable';
  let officialRecordHandoffCount = 'Unavailable';
  let bishopricDueActionCount = 'Unavailable';
  let scheduledInterviewCount = 'Unavailable';
  let technologyChecklistCount = 'Unavailable';
  let notificationHealthValue = t('noDeliveries');
  let notificationHealthDetail = t('noDeliveryDetail');
  let nextMeetingValue = t('noMeetings');
  let nextMeetingDetail = t('createMeetingDetail');
  let nextMeetingActions: { href: string; label: string }[] = [{ href: '/meetings', label: t('createFirstMeeting') }];
  let draftCountValue = t('drafts', { count: 0 });
  let draftCountDetail = t('noDrafts');
  let importSummaryValue = 'No imports yet';
  let importSummaryDetail = 'Use the imports page to import membership or calling data.';
  let portalStatusValue = 'Not configured';
  let portalStatusDetail = 'No public portal token has been created yet.';

  if (session.activeWardId && wardContext && (canAccessMeetings || canAccessMembership || canAccessCallings || dashboardModules.notifications || dashboardModules.imports)) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await setDbContext(client, wardContext);

      const result = await client.query(
        `SELECT COUNT(*)::int AS count
           FROM calling_assignment ca
           JOIN LATERAL (
              SELECT action_status
                FROM calling_action
               WHERE calling_assignment_id = ca.id
                 AND ward_id = ca.ward_id
               ORDER BY created_at DESC
               LIMIT 1
           ) latest ON TRUE
          WHERE ca.ward_id = $1
            AND ca.is_active = TRUE
            AND latest.action_status = 'SUSTAINED'`,
        [session.activeWardId]
      );

      const membershipActionQueueResult = await client.query(
        `SELECT COUNT(*) FILTER (WHERE a.status = 'action_needed')::int AS action_needed_count,
                COUNT(*) FILTER (WHERE a.interview_status IN ('needed', 'scheduled'))::int AS interview_count,
                COUNT(*) FILTER (WHERE a.planned_date < CURRENT_DATE AND a.status != 'completed')::int AS overdue_count,
                COUNT(*) FILTER (WHERE a.lcr_follow_up_status = 'needed' AND a.status = 'completed')::int AS lcr_count,
                COUNT(*) FILTER (WHERE a.action_type IN ('PRIESTHOOD_ORDINATION', 'PRIESTHOOD_ADVANCEMENT') AND (a.priesthood_office IS NULL OR a.approval_confirmed = FALSE))::int AS priesthood_preparation_count,
                COUNT(*) FILTER (WHERE a.record_form_needed = TRUE AND a.official_system_follow_up_status IN ('not_started', 'in_progress'))::int AS official_record_handoff_count
           FROM meeting_membership_ordinance a
           JOIN meeting m ON m.id = a.meeting_id AND m.ward_id = a.ward_id
          WHERE a.ward_id = $1::uuid
            AND (a.status != 'completed' OR a.lcr_follow_up_status = 'needed')`,
        [session.activeWardId]
      );

      const bishopricDueActionResult = await client.query(
        `SELECT COUNT(*)::int AS count
           FROM bishopric_action
          WHERE ward_id = $1::uuid
            AND status != 'COMPLETED'
            AND due_date < CURRENT_DATE`,
        [session.activeWardId]
      );

      const scheduledInterviewResult = await client.query(
        `SELECT COUNT(*)::int AS count
           FROM scheduled_interview
          WHERE ward_id = $1::uuid AND status = 'SCHEDULED'`,
        [session.activeWardId]
      );

      const technologyChecklistResult = canAccessTechnology
        ? await client.query(
            `SELECT COUNT(*)::int AS count
               FROM meeting m
               LEFT JOIN meeting_technology_checklist tc ON tc.meeting_id = m.id AND tc.ward_id = m.ward_id
              WHERE m.ward_id = $1::uuid
                AND m.meeting_date >= CURRENT_DATE
                AND m.meeting_date <= CURRENT_DATE + 7
                AND m.status != 'COMPLETED'
                AND (tc.id IS NULL OR tc.room_ready = FALSE OR tc.audio_ready = FALSE OR tc.stream_ready = FALSE OR tc.accessibility_checked = FALSE OR tc.recording_deletion_reminder = FALSE)`,
            [session.activeWardId]
          )
        : null;

      const notificationHealthResult = await client.query(
        `SELECT MAX(nd.attempted_at) AS last_delivery_at,
                COUNT(*) FILTER (WHERE nd.delivery_status = 'failure')::int AS failure_count
           FROM notification_delivery nd
          WHERE nd.ward_id = $1
            AND nd.channel IN ('IN_APP', 'EMAIL')`,
        [session.activeWardId]
      );

      const nextMeetingResult = await client.query(
        `SELECT id, meeting_date, meeting_type, status
           FROM meeting
          WHERE ward_id = $1
            AND meeting_date >= CURRENT_DATE
            AND status != 'COMPLETED'
          ORDER BY meeting_date ASC
          LIMIT 1`,
        [session.activeWardId]
      );

      const draftCountResult = await client.query(
        `SELECT COUNT(*)::int AS count
           FROM meeting
          WHERE ward_id = $1
            AND status = 'DRAFT'`,
        [session.activeWardId]
      );

      const importSummaryResult = await client.query(
        `SELECT import_type, parsed_count, committed, created_at
           FROM import_run
          WHERE ward_id = $1
          ORDER BY created_at DESC
          LIMIT 1`,
        [session.activeWardId]
      );

      const portalResult = await client.query(`SELECT id FROM public_program_portal WHERE ward_id = $1 LIMIT 1`, [session.activeWardId]);

      await client.query('COMMIT');
      setApartQueueCount = `${result.rows[0].count} waiting`;
      const actionQueue = membershipActionQueueResult.rows[0] as {
        action_needed_count: number;
        interview_count: number;
        overdue_count: number;
        lcr_count: number;
        priesthood_preparation_count: number;
        official_record_handoff_count: number;
      };
      membershipActionQueueCount = `${actionQueue.action_needed_count} waiting`;
      actionInterviewQueueCount = `${actionQueue.interview_count} waiting`;
      overdueActionCount = `${actionQueue.overdue_count} overdue`;
      lcrFollowUpCount = `${actionQueue.lcr_count} waiting`;
      priesthoodPreparationCount = `${actionQueue.priesthood_preparation_count} waiting`;
      officialRecordHandoffCount = `${actionQueue.official_record_handoff_count} waiting`;
      bishopricDueActionCount = `${(bishopricDueActionResult.rows[0] as { count: number }).count} overdue`;
      scheduledInterviewCount = `${(scheduledInterviewResult.rows[0] as { count: number }).count} scheduled`;
      technologyChecklistCount = technologyChecklistResult
        ? `${(technologyChecklistResult.rows[0] as { count: number }).count} needing review`
        : 'Unavailable';
      const notificationHealth = notificationHealthResult.rows[0] as { last_delivery_at: string | null; failure_count: number };
      notificationHealthValue = notificationHealth.last_delivery_at ?? 'No deliveries yet';
      notificationHealthDetail = `${notificationHealth.failure_count} failed deliveries`;

      if (nextMeetingResult.rowCount) {
        const nextMeeting = nextMeetingResult.rows[0] as { id: string; meeting_date: string; meeting_type: string; status: string };
        nextMeetingValue = `${nextMeeting.meeting_date} (${nextMeeting.meeting_type.replaceAll('_', ' ')})`;
        nextMeetingDetail = `Status: ${nextMeeting.status}`;
        nextMeetingActions = [
          { href: `/meetings/${nextMeeting.id}/edit`, label: t('edit') },
          { href: `/stand/${nextMeeting.id}`, label: t('stand') },
          { href: `/meetings/${nextMeeting.id}/print`, label: t('print') }
        ];
      }

      const draftCount = (draftCountResult.rows[0] as { count: number }).count;
      draftCountValue = t('drafts', { count: draftCount });
      draftCountDetail = draftCount > 0 ? t('draftStatus', { count: draftCount }) : t('noDrafts');

      if (importSummaryResult.rowCount) {
        const importRun = importSummaryResult.rows[0] as {
          import_type: string;
          parsed_count: number;
          committed: boolean;
          created_at: string;
        };
        importSummaryValue = `${importRun.import_type}: ${importRun.parsed_count} records`;
        importSummaryDetail = `${importRun.committed ? 'Committed' : 'Preview only'} on ${new Date(importRun.created_at).toLocaleDateString()}`;
      }

      if (portalResult.rowCount) {
        portalStatusValue = 'Active';
        portalStatusDetail = 'Public portal token is configured. Visitors can view your latest published program.';
      }
    } catch {
      await client.query('ROLLBACK');
      setApartQueueCount = 'Unavailable';
      notificationHealthValue = 'Unavailable';
      notificationHealthDetail = 'Notification diagnostics could not be loaded.';
    } finally {
      client.release();
    }
  }

  const dashboardCards: DashboardCardData[] = [];
  const addCard = (card: DashboardCardData): void => {
    dashboardCards.push(card);
  };

  if (canAccessMeetings) {
    addCard({ id: 'next-meeting', title: 'Next meeting', value: nextMeetingValue, detail: nextMeetingDetail, actions: nextMeetingActions });
    addCard({ id: 'draft-count', title: t('draftCount'), value: draftCountValue, detail: draftCountDetail, actions: [{ href: '/meetings', label: t('viewMeetings') }] });
  }
  if (canAccessMembership) {
    addCard({ id: 'membership-follow-up', title: t('membershipFollowUp'), value: membershipActionQueueCount, detail: t('announcedActions'), actions: [{ href: '/membership-ordinances?status=action_needed&queue=needs_attention', label: t('openQueue') }] });
    addCard({ id: 'priesthood-preparation', title: t('priesthoodPreparation'), value: priesthoodPreparationCount, detail: t('priesthoodDetail'), actions: [{ href: '/membership-ordinances?action=PRIESTHOOD_ORDINATION&queue=needs_attention', label: t('reviewPreparation') }] });
    addCard({ id: 'interview-follow-up', title: t('interviewFollowUp'), value: actionInterviewQueueCount, detail: t('interviewDetail'), actions: [{ href: '/membership-ordinances?followup=interview&queue=needs_attention', label: 'Review interviews' }] });
    addCard({ id: 'overdue-actions', title: t('overdueActions'), value: overdueActionCount, detail: t('overdueDetail'), actions: [{ href: '/membership-ordinances?followup=overdue&queue=needs_attention', label: 'Review overdue work' }] });
    addCard({ id: 'lcr-follow-up', title: t('lcrFollowUp'), value: lcrFollowUpCount, detail: t('lcrDetail'), actions: [{ href: '/membership-ordinances?followup=lcr&queue=needs_attention', label: 'Review LCR work' }] });
    addCard({ id: 'official-handoff', title: t('officialHandoff'), value: officialRecordHandoffCount, detail: t('officialHandoffDetail'), actions: [{ href: '/membership-ordinances?followup=official-record&queue=needs_attention', label: 'Review handoffs' }] });
  }
  if (dashboardModules.bishopric) addCard({ id: 'leadership-due', title: t('leadershipDue'), value: bishopricDueActionCount, detail: t('leadershipDetail'), actions: [{ href: '/bishopric', label: 'Open leadership workspace' }] });
  if (dashboardModules.leadership) addCard({ id: 'scheduled-interviews', title: t('scheduledInterviews'), value: scheduledInterviewCount, detail: t('scheduledInterviewDetail'), actions: [{ href: '/interviews', label: 'Open interview schedule' }] });
  if (canAccessCallings) addCard({ id: 'set-apart-queue', title: t('setApartQueue'), value: setApartQueueCount, detail: t('setApartDetail'), actions: [{ href: '/callings', label: 'Open callings queue' }] });
  if (dashboardModules.notifications) addCard({ id: 'notification-health', title: t('notificationHealth'), value: notificationHealthValue, detail: notificationHealthDetail, actions: [{ href: '/notifications/diagnostics', label: 'Open diagnostics' }] });
  if (dashboardModules.imports) addCard({ id: 'last-import', title: t('lastImport'), value: importSummaryValue, detail: importSummaryDetail, actions: [{ href: '/imports/members', label: 'Import members' }, { href: '/imports/callings', label: 'Import callings' }] });
  if (canAccessTechnology) addCard({ id: 'technology-readiness', title: t('technologyReadiness'), value: technologyChecklistCount, detail: t('technologyDetail'), actions: [{ href: '/technology', label: 'Open technology checklist' }] });
  if (canAccessPortal) addCard({ id: 'public-portal', title: t('publicPortal'), value: portalStatusValue, detail: portalStatusDetail, actions: [{ href: '/settings/public-portal', label: 'Manage portal' }] });
  if (showSupportCards) {
    addCard({ id: 'support-user-administration', title: 'Support: User administration', value: 'Global user controls', detail: 'Manage all user accounts, review role coverage, and activate or deactivate access across the system.', actions: [{ href: '/support/users', label: 'Open user administration' }] });
    addCard({ id: 'support-provisioning', title: 'Support: Stake & ward provisioning', value: 'Provisioning controls', detail: 'Create new stakes and wards so ward administrators can be assigned and onboarded.', actions: [{ href: '/support/provisioning', label: 'Open provisioning' }] });
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('welcome', { name: session.user.name ?? session.user.email ?? '' })}</p>
        </div>
        <Link href="/manual#dashboard" className="text-sm font-medium underline underline-offset-4">
          Help with the Dashboard
        </Link>
      </section>

      <DashboardGrid wardId={session.activeWardId} cards={dashboardCards} />
    </main>
  );
}
