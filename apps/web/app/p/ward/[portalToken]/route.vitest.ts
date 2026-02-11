import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock, releaseMock, connectMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
  connectMock: vi.fn()
}));

vi.mock('@/src/db/client', () => ({
  pool: {
    connect: connectMock
  }
}));

import { GET } from './route';

describe('GET /p/ward/[portalToken]', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    connectMock.mockResolvedValue({
      query: queryMock,
      release: releaseMock
    });
  });

  it('resolves the latest published ward meeting render by portal token', async () => {
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ ward_id: 'ward-1' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ render_html: '<main>Ward Published</main>' }] })
      .mockResolvedValueOnce({});

    const response = await GET(new Request('http://localhost/p/ward/portal-1'), {
      params: Promise.resolve({ portalToken: 'portal-1' })
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('<main>Ward Published</main>');
    expect(queryMock).toHaveBeenCalledWith('SELECT set_config($1, $2, true)', ['app.public_portal_token', 'portal-1']);
    expect(queryMock).toHaveBeenCalledWith('SELECT set_config($1, $2, true)', ['app.ward_id', 'ward-1']);
  });

  it('returns 404 when portal token does not exist', async () => {
    queryMock.mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce({ rowCount: 0, rows: [] }).mockResolvedValueOnce({});

    const response = await GET(new Request('http://localhost/p/ward/missing-portal'), {
      params: Promise.resolve({ portalToken: 'missing-portal' })
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Not found', code: 'NOT_FOUND' });
  });
});
