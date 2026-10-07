import { describe, expect, it } from 'vitest';

import {
  canonicalizeProgramItems,
  computeProgramItemsRevision,
  isSourceManaged,
  projectIntroductionRoles,
  toEditorProgramItems
} from './program-item-source';
import { defaultIntroductionRoles } from './program-item-contracts';

const base = {
  id: '00000000-0000-0000-0000-000000000001',
  sequence: 1,
  item_type: 'INTRODUCTION',
  title: 'Introduction',
  notes: 'Internal note',
  topic: null,
  program_notes: 'Welcome',
  hymn_number: null,
  hymn_title: null,
  hymn_locale: 'en-US',
  introduction_roles: { conducting: '', presiding: 'Bishop Hall', organist: '', chorister: '' },
  speaker_status: null
};

describe('program item source projection', () => {
  it('keeps stable source identity and distinguishes managed announcements', () => {
    const rows = toEditorProgramItems([
      { ...base, item_type: 'ANNOUNCEMENT', sequence: 2, id: '00000000-0000-0000-0000-000000000002' },
      base
    ]);
    expect(rows.map((row) => row.id)).toEqual([base.id, '00000000-0000-0000-0000-000000000002']);
    expect(rows[0].introductionRoles?.presiding).toBe('Bishop Hall');
    expect(rows[1].sourceState).toBe('MANAGED');
    expect(rows[1].managedHref).toBe('/announcements');
  });

  it('preserves valid partial Introduction role data while filling missing editable fields', () => {
    expect(
      defaultIntroductionRoles({ presiding: 'Bishop Hall', visitingLeaders: [{ name: 'President Smith', calling: 'Stake President' }] })
    ).toEqual({
      presiding: 'Bishop Hall',
      conducting: '',
      organist: '',
      chorister: '',
      visitingLeaders: [{ name: 'President Smith', calling: 'Stake President' }]
    });
  });

  it('omits visiting leaders from the non-private introduction projection', () => {
    const roles = { presiding: 'Bishop Hall', visitingLeaders: [{ name: 'President Smith', calling: 'Stake President' }] };
    expect(projectIntroductionRoles(roles, { includeInternalNotes: false })).toEqual({
      presiding: 'Bishop Hall',
      conducting: '',
      organist: '',
      chorister: ''
    });
    expect(projectIntroductionRoles(roles, { includeInternalNotes: true }).visitingLeaders).toEqual(roles.visitingLeaders);
  });
  it('treats announcements and At the Stand calling rows as source-managed', () => {
    expect(isSourceManaged('ANNOUNCEMENT')).toBe(true);
    expect(isSourceManaged('SUSTAINING')).toBe(true);
    expect(isSourceManaged('RELEASE')).toBe(true);
    expect(isSourceManaged('SPEAKER')).toBe(false);

    const rows = toEditorProgramItems([
      { ...base, item_type: 'SUSTAINING', sequence: 2, id: '00000000-0000-0000-0000-000000000002' },
      { ...base, item_type: 'RELEASE', sequence: 3, id: '00000000-0000-0000-0000-000000000003' }
    ]);
    expect(rows.map((row) => [row.sourceState, row.managedHref])).toEqual([
      ['MANAGED', '/meetings'],
      ['MANAGED', '/meetings']
    ]);
  });

  it('computes an opaque revision independent of JSON object key order', () => {
    const one = [base];
    const two = [{ ...base, introduction_roles: { presiding: 'Bishop Hall', chorister: '', conducting: '', organist: '' } }];
    expect(canonicalizeProgramItems(one)).toBe(canonicalizeProgramItems(two));
    expect(computeProgramItemsRevision(one)).toMatch(/^sr1_[a-f0-9]{64}$/);
    expect(computeProgramItemsRevision(one)).not.toBe(computeProgramItemsRevision([{ ...base, notes: 'Changed' }]));
    expect(computeProgramItemsRevision(one, { includeInternalNotes: false })).toBe(
      computeProgramItemsRevision([{ ...base, notes: 'Changed' }], { includeInternalNotes: false })
    );
  });
});
