import { Pool } from 'pg';
import argon2 from 'argon2';

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL, max: 1 });
const client = await pool.connect();
const ids = {
  stake: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  ward: '11111111-1111-4111-8111-111111111111',
  wardB: '22222222-2222-4222-8222-222222222222',
  user: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  meeting: '33333333-3333-4333-8333-333333333333',
  ordinance: '44444444-4444-4444-8444-444444444444',
  followUp: '55555555-5555-4555-8555-555555555555'
};
try {
  await client.query('BEGIN');
  await client.query(`SELECT set_config('app.user_id', $1, true)`, [ids.user]);
  await client.query(`SELECT set_config('app.ward_id', $1, true)`, [ids.ward]);
  await client.query(`DELETE FROM church_action_follow_up WHERE id = $1::uuid`, [ids.followUp]);
  await client.query(`DELETE FROM meeting_membership_ordinance WHERE id = $1::uuid`, [ids.ordinance]);
  await client.query(`DELETE FROM meeting WHERE id = $1::uuid`, [ids.meeting]);
  await client.query(`DELETE FROM ward_module_enablement WHERE ward_id IN ($1::uuid, $2::uuid)`, [ids.ward, ids.wardB]);
  await client.query(`DELETE FROM ward_user_role WHERE user_id = $1::uuid`, [ids.user]);
  await client.query(`DELETE FROM user_account WHERE id = $1::uuid`, [ids.user]);
  await client.query(`DELETE FROM ward WHERE id IN ($1::uuid, $2::uuid)`, [ids.ward, ids.wardB]);
  await client.query(`DELETE FROM stake WHERE id = $1::uuid`, [ids.stake]);
  await client.query(`INSERT INTO stake (id, name) VALUES ($1::uuid, 'E2E Stake')`, [ids.stake]);
  await client.query(`INSERT INTO ward (id, stake_id, name, unit_number) VALUES ($1::uuid, $2::uuid, 'E2E Ward A', '85510'), ($3::uuid, $2::uuid, 'E2E Ward B', '85511')`, [ids.ward, ids.stake, ids.wardB]);
  const hash = await argon2.hash('WardAdminPassword123456789012');
  await client.query(`INSERT INTO user_account (id, email, display_name, password_hash, must_change_password, is_active) VALUES ($1::uuid, 'ward-admin@example.test', 'E2E Ward Admin', $2, false, true)`, [ids.user, hash]);
  const role = await client.query(`INSERT INTO role (name, scope) VALUES ('BISHOPRIC_EDITOR', 'WARD') ON CONFLICT (name) DO UPDATE SET scope = EXCLUDED.scope RETURNING id`);
  await client.query(`SELECT set_config('app.user_id', $1, true)`, [ids.user]);
  await client.query(`SELECT set_config('app.ward_id', $1, true)`, [ids.ward]);
  await client.query(`INSERT INTO ward_user_role (ward_id, user_id, role_id) VALUES ($1::uuid, $2::uuid, $3::uuid)`, [ids.ward, ids.user, role.rows[0].id]);
  await client.query(`INSERT INTO ward_module_enablement (ward_id, module_id, enabled, updated_by_user_id) VALUES ($1::uuid, 'actions-to-do', true, $2::uuid), ($1::uuid, 'programs', true, $2::uuid)`, [ids.ward, ids.user]);
  await client.query(`INSERT INTO meeting (id, ward_id, meeting_date, meeting_type, status) VALUES ($1::uuid, $2::uuid, CURRENT_DATE, 'SACRAMENT', 'DRAFT')`, [ids.meeting, ids.ward]);
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
