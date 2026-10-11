import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, canUseInternalNotesMock, canViewMeetingsMock, moduleEnabledMock, setDbContextMock, connectMock, releaseMock, queryMock } =
  vi.hoisted(() => ({
    authMock: vi.fn(),
    canUseInternalNotesMock: vi.fn(),
    canViewMeetingsMock: vi.fn(),
    moduleEnabledMock: vi.fn(),
    setDbContextMock: vi.fn(),
    connectMock: vi.fn(),
    releaseMock: vi.fn(),
    queryMock: vi.fn()
  }));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/auth/roles', () => ({ canUseInternalNotes: canUseInternalNotesMock, canViewMeetings: canViewMeetingsMock }));
vi.mock('@/src/modules/service', () => ({ isWardModuleEnabledInTransaction: moduleEnabledMock }));
vi.mock('@/src/db/context', () => ({ setDbContext: setDbContextMock }));
vi.mock('@/src/db/client', () => ({ pool: { connect: connectMock } }));

import { GET } from './route';

const templateRow = {
  welcome_text: 'Welcome',
  sustain_template: 'Sustain {memberName}',
  release_template: 'Release {memberName}',
  welcome_new_member_template: 'Welcome member {memberName}',
  recognize_baptized_child_template: 'Recognize {memberName}',
  baby_blessing_template: 'Bless {memberName}',
  priesthood_ordination_template: 'Ordain {memberName} as {callingName}',
  priesthood_advancement_template: 'Advance {memberName} as {callingName}'
};

const membershipAction = {
  id: 'membership-action-1',
  member_name: 'Jordan Lee',
  action_type: 'WELCOME_NEW_MEMBER',
  priesthood_office: null,
  status: 'pending',
  planned_date: '2026-10-11',
  interview_status: 'not_required',
  baptism_date: null,
  confirmation_date: null,
  baptism_status: null,
  confirmation_status: null,
  responsible_leader: null,
  lcr_follow_up_status: 'not_applicable',
  carried_forward: false,
  details: 'PRIVATE ACTION DETAILS MUST NOT BE INCLUDED'
};

describe('GET /api/w/[wardId]/meetings/[meetingId]/offline-snapshot membership templates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: 'user-1', roles: ['STAND_ADMIN'] }, activeWardId: 'ward-1' });
    canUseInternalNotesMock.mockReturnValue(false);
    canViewMeetingsMock.mockReturnValue(true);
    moduleEnabledMock.mockImplementation((_client, _wardId, module) => Promise.resolve(module === 'membership-ordinances'));
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock });
    queryMock.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return {};
      if (sql.includes('SELECT m.id, m.meeting_date')) {
        return {
          rowCount: 1,
          rows: [
            {
              id: 'meeting-1',
              meeting_date: '2026-10-11',
              meeting_type: 'SACRAMENT',
              default_locale: 'en-US',
              user_preferred_locale: 'en-US'
            }
          ]
        };
      }
      if (sql.includes('FROM ward_stand_template')) return { rows: [templateRow] };
      if (sql.includes('FROM meeting_membership_ordinance')) return { rows: [membershipAction] };
      return { rows: [] };
    });
  });

  it('serializes membership templates while preserving the minimal membership-action projection', async () => {
    const response = await GET(new Request('http://localhost/api/w/ward-1/meetings/meeting-1/offline-snapshot'), {
      params: Promise.resolve({ wardId: 'ward-1', meetingId: 'meeting-1' })
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.membershipTemplates).toEqual({
      WELCOME_NEW_MEMBER: templateRow.welcome_new_member_template,
      RECOGNIZE_BAPTIZED_CHILD: templateRow.recognize_baptized_child_template,
      BABY_BLESSING: templateRow.baby_blessing_template,
      PRIESTHOOD_ORDINATION: templateRow.priesthood_ordination_template,
      PRIESTHOOD_ADVANCEMENT: templateRow.priesthood_advancement_template
    });
    expect(payload.membershipActions).toEqual([
      expect.objectContaining({ id: 'membership-action-1', memberName: 'Jordan Lee', actionType: 'WELCOME_NEW_MEMBER' })
    ]);
    expect(payload.membershipActions[0]).not.toHaveProperty('details');
    expect(JSON.stringify(payload)).not.toContain('PRIVATE ACTION DETAILS MUST NOT BE INCLUDED');

    const templateQuery = queryMock.mock.calls.find(([sql]) => typeof sql === 'string' && sql.includes('FROM ward_stand_template'))?.[0] as
      | string
      | undefined;
    expect(templateQuery).toContain('welcome_new_member_template');
    expect(templateQuery).toContain('recognize_baptized_child_template');
    expect(templateQuery).toContain('baby_blessing_template');
    expect(templateQuery).toContain('priesthood_ordination_template');
    expect(templateQuery).toContain('priesthood_advancement_template');
    const membershipQuery = queryMock.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('FROM meeting_membership_ordinance')
    )?.[0] as string | undefined;
    expect(membershipQuery).toBeDefined();
    expect(membershipQuery).not.toContain('a.details');
    expect(membershipQuery).toContain('route_meeting.ward_id = $2::uuid');
    const businessQuery = queryMock.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('FROM meeting_business_line b') && sql.includes('JOIN meeting source_meeting')
    )?.[0] as string | undefined;
    expect(businessQuery).toContain('route_meeting.ward_id = $2::uuid');
    expect(releaseMock).toHaveBeenCalledOnce();
  });
});
