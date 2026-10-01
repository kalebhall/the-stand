import { Pool } from 'pg';
import argon2 from 'argon2';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (process.env.E2E_FIXTURES_ALLOWED !== '1' || !testDatabaseUrl || process.env.DATABASE_URL !== testDatabaseUrl) {
  throw new Error('E2E fixtures require explicit E2E_FIXTURES_ALLOWED=1 and DATABASE_URL to exactly match TEST_DATABASE_URL');
}

const pool = new Pool({ connectionString: testDatabaseUrl, max: 1 });
const client = await pool.connect();
const ids = {
  stake: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  ward: '11111111-1111-4111-8111-111111111111',
  wardB: '22222222-2222-4222-8222-222222222222',
  user: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  meeting: '33333333-3333-4333-8333-333333333333',
  render: '66666666-6666-4666-8666-666666666666',
  share: '77777777-7777-4777-8777-777777777777',
  portal: '88888888-8888-4888-8888-888888888888',
  calling: '99999999-9999-4999-8999-999999999999',
  callingAction: 'aaaaaaa1-1111-4111-8111-aaaaaaaaaaaa',
  ordinance: '44444444-4444-4444-8444-444444444444',
  followUp: '55555555-5555-4555-8555-555555555555'
};
try {
  await client.query('BEGIN');
  await client.query(`SELECT set_config('app.user_id', $1, true)`, [ids.user]);
  await client.query(`SELECT set_config('app.ward_id', $1, true)`, [ids.ward]);
  const tokenCollisions = await client.query(`SELECT token, ward_id FROM public_program_share WHERE token = 'meeting-token-e2e' UNION ALL SELECT token, ward_id FROM public_program_portal WHERE token = 'portal-token-e2e'`, []);
  if (tokenCollisions.rows.some((row) => row.ward_id !== ids.ward)) throw new Error('E2E public token collision outside fixture ward');
  await client.query(`DELETE FROM public_program_portal WHERE token = 'portal-token-e2e' AND ward_id = $1::uuid`, [ids.ward]);
  await client.query(`DELETE FROM public_program_share WHERE token = 'meeting-token-e2e' AND ward_id = $1::uuid`, [ids.ward]);
  await client.query(`DELETE FROM public_program_portal WHERE id = $1::uuid AND ward_id = $2::uuid`, [ids.portal, ids.ward]);
  await client.query(`DELETE FROM public_program_share WHERE id = $1::uuid AND ward_id = $2::uuid`, [ids.share, ids.ward]);
  await client.query(`DELETE FROM meeting_business_line WHERE meeting_id = $1::uuid AND ward_id = $2::uuid`, [ids.meeting, ids.ward]);
  await client.query(`DELETE FROM calling_action WHERE id = $1::uuid AND ward_id = $2::uuid`, [ids.callingAction, ids.ward]);
  await client.query(`DELETE FROM calling_assignment WHERE id = $1::uuid AND ward_id = $2::uuid`, [ids.calling, ids.ward]);
  await client.query(`DELETE FROM church_action_follow_up WHERE id = $1::uuid AND ward_id = $2::uuid`, [ids.followUp, ids.ward]);
  await client.query(`DELETE FROM meeting_membership_ordinance WHERE id = $1::uuid AND ward_id = $2::uuid`, [ids.ordinance, ids.ward]);
  await client.query(`DELETE FROM ward_module_enablement WHERE ward_id IN ($1::uuid, $2::uuid)`, [ids.ward, ids.wardB]);
  await client.query(`DELETE FROM user_global_role WHERE user_id = $1::uuid`, [ids.user]);
  await client.query(`DELETE FROM stake_user_role WHERE user_id = $1::uuid AND stake_id = $2::uuid`, [ids.user, ids.stake]);
  await client.query(`DELETE FROM ward_user_role WHERE user_id = $1::uuid AND ward_id IN ($2::uuid, $3::uuid)`, [ids.user, ids.ward, ids.wardB]);
  await client.query(`INSERT INTO stake (id, name) VALUES ($1::uuid, 'E2E Stake') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`, [ids.stake]);
  await client.query(`INSERT INTO ward (id, stake_id, name, unit_number) VALUES ($1::uuid, $2::uuid, 'E2E Ward A', '85510'), ($3::uuid, $2::uuid, 'E2E Ward B', '85511') ON CONFLICT (id) DO UPDATE SET stake_id = EXCLUDED.stake_id, name = EXCLUDED.name, unit_number = EXCLUDED.unit_number`, [ids.ward, ids.stake, ids.wardB]);
  const hash = await argon2.hash('WardAdminPassword123456789012');
  await client.query(`INSERT INTO user_account (id, email, display_name, password_hash, must_change_password, is_active) VALUES ($1::uuid, 'ward-admin@example.test', 'E2E Ward Admin', $2, false, true) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name, password_hash = EXCLUDED.password_hash, must_change_password = false, is_active = true`, [ids.user, hash]);
  const role = await client.query(`INSERT INTO role (name, scope) VALUES ('BISHOPRIC_EDITOR', 'WARD') ON CONFLICT (name) DO NOTHING RETURNING id`);
  const roleId = role.rows[0]?.id ?? (await client.query(`SELECT id FROM role WHERE name = 'BISHOPRIC_EDITOR' AND scope = 'WARD' LIMIT 1`)).rows[0]?.id;
  if (!roleId) throw new Error('BISHOPRIC_EDITOR role fixture is unavailable');
  await client.query(`SELECT set_config('app.user_id', $1, true)`, [ids.user]);
  await client.query(`SELECT set_config('app.ward_id', $1, true)`, [ids.ward]);
  await client.query(`INSERT INTO ward_user_role (ward_id, user_id, role_id) VALUES ($1::uuid, $2::uuid, $3::uuid) ON CONFLICT (ward_id, user_id, role_id) DO UPDATE SET revoked_at = NULL`, [ids.ward, ids.user, roleId]);
  await client.query(`INSERT INTO ward_module_enablement (ward_id, module_id, enabled, updated_by_user_id) VALUES ($1::uuid, 'actions-to-do', true, $2::uuid), ($1::uuid, 'programs', true, $2::uuid)`, [ids.ward, ids.user]);
  await client.query(`INSERT INTO meeting (id, ward_id, meeting_date, meeting_type, status) VALUES ($1::uuid, $2::uuid, CURRENT_DATE, 'SACRAMENT', 'PUBLISHED') ON CONFLICT (id) DO UPDATE SET status = 'PUBLISHED', meeting_date = CURRENT_DATE`, [ids.meeting, ids.ward]);
  await client.query(`INSERT INTO calling_assignment (id, ward_id, member_name, organization, calling_name, sustained_date, set_apart, is_active) VALUES ($1::uuid, $2::uuid, 'Jane Doe', 'Primary', 'Primary President', CURRENT_DATE, true, true)`, [ids.calling, ids.ward]);
  await client.query(`INSERT INTO calling_action (id, ward_id, calling_assignment_id, action_status) VALUES ($1::uuid, $2::uuid, $3::uuid, 'EXTENDED')`, [ids.callingAction, ids.ward, ids.calling]);
  await client.query(`INSERT INTO meeting_business_line (ward_id, meeting_id, calling_assignment_id, member_name, calling_name, action_type, status) VALUES ($1::uuid, $2::uuid, $3::uuid, 'Jane Doe', 'Primary President', 'SUSTAIN', 'pending')`, [ids.ward, ids.meeting, ids.calling]);
  await client.query(`INSERT INTO meeting_program_render (id, ward_id, meeting_id, version, render_html, layout_json, render_data_json, document_type, published_by_user_id, publication_metadata_json) VALUES ($1::uuid, $2::uuid, $3::uuid, 1, $4, '{"schemaVersion":1}'::jsonb, '{"schemaVersion":1}'::jsonb, 'SACRAMENT_PROGRAM', $5::uuid, '{}'::jsonb) ON CONFLICT (id) DO NOTHING`, [ids.render, ids.ward, ids.meeting, '<html><head><title>E2E Ward A</title></head><body><strong>Jane Doe</strong><span>Primary President</span><p>E2E Ward A</p></body></html>', ids.user]);
  await client.query(`INSERT INTO public_program_share (id, ward_id, meeting_id, token, active_render_id) VALUES ($1::uuid, $2::uuid, $3::uuid, 'meeting-token-e2e', $4::uuid)`, [ids.share, ids.ward, ids.meeting, ids.render]);
  await client.query(`INSERT INTO public_program_portal (id, ward_id, token) VALUES ($1::uuid, $2::uuid, 'portal-token-e2e')`, [ids.portal, ids.ward]);
  const fixtureState = await client.query(`
    SELECT
      (SELECT ward_id = $1::uuid AND meeting_type = 'SACRAMENT' AND status = 'PUBLISHED' FROM meeting WHERE id = $2::uuid) AS meeting_ok,
      (SELECT ward_id = $1::uuid AND meeting_id = $2::uuid AND render_html LIKE '%E2E Ward A%' AND render_html LIKE '%Jane Doe%' FROM meeting_program_render WHERE id = $3::uuid) AS render_ok,
      (SELECT ward_id = $1::uuid AND meeting_id = $2::uuid AND active_render_id = $3::uuid FROM public_program_share WHERE token = 'meeting-token-e2e') AS share_ok,
      (SELECT ward_id = $1::uuid FROM public_program_portal WHERE token = 'portal-token-e2e') AS portal_ok`, [ids.ward, ids.meeting, ids.render]);
  const state = fixtureState.rows[0];
  if (!state?.meeting_ok || !state.render_ok || !state.share_ok || !state.portal_ok) {
    throw new Error('E2E public fixture readback validation failed');
  }
  await client.query(`INSERT INTO meeting_membership_ordinance (id, ward_id, meeting_id, member_name, action_type, status, lcr_follow_up_status, priesthood_office, planned_date) VALUES ($1::uuid, $2::uuid, $3::uuid, 'John Doe', 'PRIESTHOOD_ORDINATION', 'completed', 'needed', 'ELDER', CURRENT_DATE)`, [ids.ordinance, ids.ward, ids.meeting]);
  await client.query(`INSERT INTO church_action_follow_up (id, ward_id, family, action_type, status, member_name, membership_ordinance_id, source_event, source_event_id, description, official_system, official_reference_url, due_date) VALUES ($1::uuid, $2::uuid, 'PRIESTHOOD', 'PRIESTHOOD_ORDINATION', 'OPEN', 'John Doe', $3::uuid, 'MEMBERSHIP_ORDINANCE_COMPLETED', $3::uuid, 'Follow up in LCR: record the priesthood ordination for John Doe.', 'LCR', 'https://www.churchofjesuschrist.org/tools/help/record-melchizedek-priesthood-ordinations?lang=eng', CURRENT_DATE)`, [ids.followUp, ids.ward, ids.ordinance]);
  await client.query('COMMIT');
  console.log('e2e actions fixtures ready');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
