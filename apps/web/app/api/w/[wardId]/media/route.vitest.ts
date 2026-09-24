import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, connectMock, recordAuditEventMock, listReadableMediaMock, createWardMediaMock, archiveWardMediaMock, moduleEnabledMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  connectMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
  listReadableMediaMock: vi.fn(),
  createWardMediaMock: vi.fn(),
  archiveWardMediaMock: vi.fn(),
  moduleEnabledMock: vi.fn()
}));

vi.mock('@/src/auth/auth', () => ({ auth: authMock }));
vi.mock('@/src/db/client', () => ({ pool: { connect: connectMock } }));
vi.mock('@/src/audit/service', () => ({ recordAuditEvent: recordAuditEventMock }));
vi.mock('@/src/modules/service', () => ({ isWardModuleEnabled: moduleEnabledMock }));
vi.mock('@/src/document-designer/media-service', () => ({
  listReadableMedia: listReadableMediaMock,
  createWardMedia: createWardMediaMock,
  archiveWardMedia: archiveWardMediaMock,
  MediaServiceError: class MediaServiceError extends Error {
    code: string;
    constructor(code: string, message: string) { super(message); this.code = code; }
  }
}));

import { GET, POST } from './route';
import { DELETE } from './[assetId]/route';

const session = {
  user: { id: 'user-a', name: 'Program Editor', email: 'editor@example.test', roles: ['PROGRAM_EDITOR'] },
  activeWardId: 'ward-a'
};

function setupClient(settings = { allow_program_editor_delete_media: false }) {
  const client = {
    query: vi.fn(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('allow_program_editor_delete_media')) return { rows: [settings] };
      return { rows: [] };
    }),
    release: vi.fn()
  };
  connectMock.mockResolvedValue(client);
  return client;
}

const wardContext = { params: Promise.resolve({ wardId: 'ward-a' }) };
const assetContext = { params: Promise.resolve({ wardId: 'ward-a', assetId: 'asset-a' }) };

function uploadRequest() {
  const form = new FormData();
  form.set('file', new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' }));
  form.set('altText', 'Ward logo');
  return new Request('http://localhost', { method: 'POST', body: form });
}

describe('media routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue(session);
    moduleEnabledMock.mockResolvedValue(true);
    listReadableMediaMock.mockResolvedValue([]);
    createWardMediaMock.mockResolvedValue({ id: 'asset-a', filename: 'logo.png', mime_type: 'image/png', byte_size: 3 });
    archiveWardMediaMock.mockResolvedValue(undefined);
  });

  it('rejects direct Programs access when the module is disabled before opening a database connection', async () => {
    moduleEnabledMock.mockResolvedValue(false);
    const response = await GET(new Request('http://localhost'), wardContext);
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('FORBIDDEN');
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('rejects upload for a different active ward before opening a database connection', async () => {
    authMock.mockResolvedValue({ ...session, activeWardId: 'ward-b' });
    const response = await POST(uploadRequest(), wardContext);
    expect(response.status).toBe(403);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it('uploads media through the authenticated ward-scoped transaction and audits it', async () => {
    const client = setupClient();
    const response = await POST(uploadRequest(), wardContext);
    expect(response.status).toBe(201);
    expect(createWardMediaMock).toHaveBeenCalledWith(client, expect.objectContaining({ wardId: 'ward-a', userId: 'user-a' }));
    expect(recordAuditEventMock).toHaveBeenCalledWith(client, expect.objectContaining({
      action: 'MEDIA_UPLOADED', entityId: 'asset-a', wardId: 'ward-a'
    }));
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('requires the ward setting before allowing a Program Editor to archive media', async () => {
    setupClient({ allow_program_editor_delete_media: false });
    const response = await DELETE(new Request('http://localhost', { method: 'DELETE' }), assetContext);
    expect(response.status).toBe(403);
    expect(archiveWardMediaMock).not.toHaveBeenCalled();
  });

  it('archives media and audits the mutation when the delete profile allows it', async () => {
    const client = setupClient({ allow_program_editor_delete_media: true });
    const response = await DELETE(new Request('http://localhost', { method: 'DELETE' }), assetContext);
    expect(response.status).toBe(200);
    expect(archiveWardMediaMock).toHaveBeenCalledWith(client, 'ward-a', 'asset-a');
    expect(recordAuditEventMock).toHaveBeenCalledWith(client, expect.objectContaining({
      action: 'MEDIA_ARCHIVED', entityId: 'asset-a', wardId: 'ward-a'
    }));
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });
});
