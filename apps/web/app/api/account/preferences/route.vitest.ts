import { describe, expect, it, vi, beforeEach } from 'vitest';

const authMock = vi.hoisted(() => vi.fn());
const queryMock = vi.hoisted(() => vi.fn());

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/db/client', () => ({ pool: { query: queryMock } }));

import { GET, PATCH } from './route';

beforeEach(() => {
  authMock.mockReset();
  queryMock.mockReset();
});

describe('account preference locale route', () => {
  it('rejects unauthenticated reads', async () => {
    authMock.mockResolvedValueOnce(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('returns the authenticated user locale only', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'user-1' } });
    queryMock.mockResolvedValueOnce({ rows: [{ preferred_locale: 'es' }], rowCount: 1 });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ locale: 'es' });
    expect(queryMock).toHaveBeenCalledWith('SELECT preferred_locale FROM user_account WHERE id = $1::uuid AND is_active = true LIMIT 1', [
      'user-1'
    ]);
  });

  it('returns a stable error when reading preferences fails', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'user-1' } });
    queryMock.mockRejectedValueOnce(new Error('database unavailable'));

    const response = await GET();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Failed to load account preferences', code: 'INTERNAL_ERROR' });
  });

  it('rejects unsupported locale values before writing', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'user-1' } });

    const response = await PATCH(
      new Request('http://localhost/api/account/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ locale: 'fr' })
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Unsupported locale', code: 'INVALID_LOCALE' });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('returns a stable error when saving preferences fails', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'user-1' } });
    queryMock.mockRejectedValueOnce(new Error('database unavailable'));

    const response = await PATCH(
      new Request('http://localhost/api/account/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ locale: 'es' })
      })
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Failed to save account preferences', code: 'INTERNAL_ERROR' });
  });

  it('updates the authenticated user locale and cookie', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'user-1' } });
    queryMock.mockResolvedValueOnce({ rows: [{ preferred_locale: 'es' }], rowCount: 1 });

    const response = await PATCH(
      new Request('http://localhost/api/account/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ locale: 'es' })
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ locale: 'es' });
    expect(response.headers.get('set-cookie')).toContain('NEXT_LOCALE=es');
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('UPDATE user_account'), ['es', 'user-1']);
  });
});
