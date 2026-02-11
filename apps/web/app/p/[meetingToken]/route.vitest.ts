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

describe('GET /p/[meetingToken]', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    connectMock.mockResolvedValue({
      query: queryMock,
      release: releaseMock
    });
  });

  it('returns html for published meeting token', async () => {
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ render_html: '<main>Published</main>' }] })
      .mockResolvedValueOnce({});

    const response = await GET(new Request('http://localhost/p/token-1'), {
      params: Promise.resolve({ meetingToken: 'token-1' })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toBe('<main>Published</main>');
    expect(queryMock).toHaveBeenCalledWith('SELECT set_config($1, $2, true)', ['app.public_meeting_token', 'token-1']);
  });

  it('returns 404 when token has no published render', async () => {
    queryMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({});

    const response = await GET(new Request('http://localhost/p/missing-token'), {
      params: Promise.resolve({ meetingToken: 'missing-token' })
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Not found', code: 'NOT_FOUND' });
  });
});
