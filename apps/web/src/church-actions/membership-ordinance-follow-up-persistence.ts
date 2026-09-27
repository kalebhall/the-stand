import type { PoolClient } from 'pg';

const AARONIC_RECORD_URL = 'https://www.churchofjesuschrist.org/tools/help/record-aaronic-priesthood-ordinations?lang=eng';
const MELCHIZEDEK_RECORD_URL = 'https://www.churchofjesuschrist.org/tools/help/record-melchizedek-priesthood-ordinations?lang=eng';

const MELCHIZEDEK_OFFICES = new Set(['ELDER', 'HIGH_PRIEST', 'SEVENTY', 'PATRIARCH', 'BISHOP']);

export type MembershipOrdinanceFollowUpInput = {
  wardId: string;
  ordinanceId: string;
  memberName: string;
  actionType: 'PRIESTHOOD_ORDINATION' | 'PRIESTHOOD_ADVANCEMENT';
  priesthoodOffice: string | null;
  plannedDate: string | null;
  details: string | null;
};

export async function persistMembershipOrdinanceLcrFollowUp(
  client: Pick<PoolClient, 'query'>,
  input: MembershipOrdinanceFollowUpInput
): Promise<void> {
  const recordUrl = MELCHIZEDEK_OFFICES.has(input.priesthoodOffice ?? '') ? MELCHIZEDEK_RECORD_URL : AARONIC_RECORD_URL;
  const description = `Follow up in LCR: record ${input.actionType === 'PRIESTHOOD_ADVANCEMENT' ? 'the priesthood advancement' : 'the priesthood ordination'} for ${input.memberName}.`;

  await client.query(
    `INSERT INTO church_action_follow_up
       (ward_id, family, action_type, status, member_name, membership_ordinance_id,
        source_event, source_event_id, description, official_system, official_reference_url, due_date)
     VALUES ($1::uuid, 'PRIESTHOOD', $2::text, 'OPEN', $3::text, $4::uuid,
             'MEMBERSHIP_ORDINANCE_COMPLETED', $4::uuid, $5::text, 'LCR', $6::text, $7::date)
     ON CONFLICT (ward_id, action_type, source_event_id)
     DO UPDATE SET member_name = EXCLUDED.member_name,
                   membership_ordinance_id = EXCLUDED.membership_ordinance_id,
                   description = EXCLUDED.description,
                   official_reference_url = EXCLUDED.official_reference_url,
                   due_date = EXCLUDED.due_date,
                   updated_at = now()`,
    [input.wardId, input.actionType, input.memberName, input.ordinanceId, description, recordUrl, input.plannedDate]
  );
}
