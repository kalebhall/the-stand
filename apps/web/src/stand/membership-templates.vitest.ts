import { describe, expect, it } from 'vitest';

import { DEFAULT_STAND_BUSINESS_TEMPLATES } from './default-template';
import { parseMembershipTemplateSegments, renderMembershipOrdinanceScript } from './membership-templates';

describe('membership ordinance Stand scripts', () => {
  it('uses custom welcome templates and substitutes the member name', () => {
    expect(
      renderMembershipOrdinanceScript(
        { action_type: 'WELCOME_NEW_MEMBER', member_name: 'Jordan Lee' },
        { WELCOME_NEW_MEMBER: 'Welcome **{memberName}**.' },
        { assignedOffice: 'the assigned office' }
      )
    ).toBe('Welcome **Jordan Lee**.');
  });

  it('uses the selected priesthood office when a priesthood template needs a calling name', () => {
    expect(
      renderMembershipOrdinanceScript(
        { action_type: 'PRIESTHOOD_ORDINATION', member_name: 'Casey Rivera', priesthood_office: 'PRIEST' },
        { PRIESTHOOD_ORDINATION: 'Ordain {memberName} to {callingName}.' },
        { assignedOffice: 'the assigned office', priesthoodOffice: 'Priest' }
      )
    ).toBe('Ordain Casey Rivera to Priest.');
  });

  it.each(['WELCOME_NEW_MEMBER', 'RECOGNIZE_BAPTIZED_CHILD', 'BABY_BLESSING', 'PRIESTHOOD_ORDINATION', 'PRIESTHOOD_ADVANCEMENT'] as const)(
    'uses the configured template for %s',
    (action_type) => {
      expect(
        renderMembershipOrdinanceScript(
          { action_type, member_name: 'Jordan Lee' },
          { [action_type]: `${action_type}: {memberName}` },
          { assignedOffice: 'the assigned office' }
        )
      ).toBe(`${action_type}: Jordan Lee`);
    }
  );

  it('uses only the selected office for calling names and safely falls back for unknown offices', () => {
    const template = { PRIESTHOOD_ORDINATION: '{memberName}: {callingName}' };
    expect(
      renderMembershipOrdinanceScript(
        {
          action_type: 'PRIESTHOOD_ORDINATION',
          member_name: 'Casey Rivera',
          priesthood_office: 'PRIEST',
          details: 'PRIVATE PLANNING NOTE'
        } as never,
        template,
        { assignedOffice: 'assigned office', priesthoodOffice: 'Priest' }
      )
    ).toBe('Casey Rivera: Priest');
    expect(
      renderMembershipOrdinanceScript(
        { action_type: 'PRIESTHOOD_ORDINATION', member_name: 'Casey Rivera', priesthood_office: 'UNKNOWN' },
        template,
        { assignedOffice: 'assigned office', priesthoodOffice: 'Unknown' }
      )
    ).toBe('Casey Rivera: assigned office');
  });

  it('falls back to defaults when an offline cached template value is malformed', () => {
    expect(
      renderMembershipOrdinanceScript(
        { action_type: 'WELCOME_NEW_MEMBER', member_name: 'Jordan Lee' },
        { WELCOME_NEW_MEMBER: 42 } as never,
        { assignedOffice: 'the assigned office' }
      )
    ).toBe(DEFAULT_STAND_BUSINESS_TEMPLATES.WELCOME_NEW_MEMBER.replaceAll('{memberName}', 'Jordan Lee'));
  });

  it('falls back to the default script when the stored template is absent or blank', () => {
    expect(
      renderMembershipOrdinanceScript(
        { action_type: 'WELCOME_NEW_MEMBER', member_name: 'Jordan Lee' },
        { WELCOME_NEW_MEMBER: '   ' },
        { assignedOffice: 'the assigned office' }
      )
    ).toBe(DEFAULT_STAND_BUSINESS_TEMPLATES.WELCOME_NEW_MEMBER.replaceAll('{memberName}', 'Jordan Lee'));
  });

  it('does not create scripts for follow-up-only action types and preserves emphasis segments', () => {
    expect(
      renderMembershipOrdinanceScript({ action_type: 'BAPTISM_CONFIRMATION_FOLLOW_UP', member_name: 'Jordan Lee' }, undefined, {
        assignedOffice: 'the assigned office'
      })
    ).toBeNull();
    expect(parseMembershipTemplateSegments('Welcome **Jordan**.')).toEqual([
      { text: 'Welcome ', bold: false },
      { text: 'Jordan', bold: true },
      { text: '.', bold: false }
    ]);
  });
});
