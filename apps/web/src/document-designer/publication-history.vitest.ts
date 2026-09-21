import { describe, expect, it } from 'vitest';
import type { Queryable } from './persistence';
import { getActivePublication, listPublicationHistory, selectActivePublication, validateRollbackTarget, PublicationHistoryError } from './publication-history';

const rows = [{ id: 'r1', ward_id: 'w1', meeting_id: 'm1', version: 2, document_type: 'SACRAMENT_PROGRAM', source_template_id: null, source_template_version: null, published_by_user_id: 'u1', published_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z' }];
function client(resultRows: unknown[] = rows): Queryable & { calls: string[] } {
  const calls: string[] = [];
  return { calls, query: async (sql: string) => { calls.push(sql); return { rows: resultRows as Record<string, unknown>[] }; } };
}

describe('publication history', () => {
  it('uses both ward and meeting predicates and omits private render data', async () => {
    const db = client();
    const history = await listPublicationHistory(db, { wardId: 'w1', meetingId: 'm1' });
    expect(history[0]).not.toHaveProperty('layoutJson');
    expect(db.calls[0]).toContain('r.ward_id = $1::uuid AND r.meeting_id = $2::uuid');
  });

  it('resolves only the active, unexpired pointer for the requested ward and meeting', async () => {
    const db = client();
    const active = await getActivePublication(db, { wardId: 'w1', meetingId: 'm1' });
    expect(active?.active).toBe(true);
    expect(db.calls[0]).toContain('s.active_render_id');
    expect(db.calls[0]).toContain('s.ward_id = $1::uuid AND s.meeting_id = $2::uuid');
    expect(db.calls[0]).toContain('s.expires_at IS NOT NULL AND s.expires_at <= now()');
  });

  it('rejects cross-ward and cross-meeting rollback targets plus incomplete inputs', () => {
    const target = { id: 'r1', wardId: 'w1', meetingId: 'm1', version: 2, documentType: 'SACRAMENT_PROGRAM', sourceTemplateId: null, sourceTemplateVersion: null, publishedByUserId: 'u1', publishedAt: '2026-01-01', createdAt: '2026-01-01', active: false, expiresAt: null, expired: false, activeButExpired: false };
    expect(() => validateRollbackTarget({ ...target, wardId: 'other' }, { wardId: 'w1', meetingId: 'm1' })).toThrow(PublicationHistoryError);
    expect(() => validateRollbackTarget({ ...target, meetingId: 'other' }, { wardId: 'w1', meetingId: 'm1' })).toThrow(/ward and meeting/);
    expect(() => validateRollbackTarget({ ...target, publishedAt: null }, { wardId: 'w1', meetingId: 'm1' })).toThrow(/immutable/);
    expect(() => validateRollbackTarget({ ...target, version: 0 }, { wardId: 'w1', meetingId: 'm1' })).toThrow(/immutable/);
  });

  it('fails when the share row is missing and never updates a render row', async () => {
    const db = client([{ id: 'r1', ward_id: 'w1', meeting_id: 'm1', layout_json: {}, render_data_json: {}, published_at: '2026-01-01' }]);
    db.query = async (sql: string) => {
      db.calls.push(sql);
      return { rows: db.calls.length === 1 ? [{ id: 'r1', ward_id: 'w1', meeting_id: 'm1', layout_json: {}, render_data_json: {}, published_at: '2026-01-01' }] : [] };
    };
    await expect(selectActivePublication(db, { wardId: 'w1', meetingId: 'm1', renderId: 'r1' })).rejects.toMatchObject({ code: 'ACTIVE_POINTER_NOT_FOUND' });
    expect(db.calls.at(-1)).toContain('UPDATE public_program_share');
    expect(db.calls.some((sql) => sql.startsWith('UPDATE meeting_program_render'))).toBe(false);
  });

  it('selects a complete target when the share update returns a row', async () => {
    const db = client([{ id: 'r1', ward_id: 'w1', meeting_id: 'm1', layout_json: {}, render_data_json: {}, published_at: '2026-01-01' }]);
    await selectActivePublication(db, { wardId: 'w1', meetingId: 'm1', renderId: 'r1' });
    expect(db.calls.at(-1)).toContain('RETURNING meeting_id');
  });
});
