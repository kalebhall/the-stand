// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { MESSAGE_CATALOGS } from '@/src/i18n/messages';
import { TemplateAdminClient } from './template-admin-client';
import { parseTemplateLayout } from '@/src/document-designer/template-service';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const renderWithMessages = (ui: React.ReactNode) => render(<NextIntlClientProvider locale="en-US" messages={MESSAGE_CATALOGS['en-US']}>{ui}</NextIntlClientProvider>);

describe('TemplateAdminClient', () => {
  it('loads explicit system scope and exposes policy, lock, and history controls', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ templates: [{ id: 't1', name: 'System source', status: 'DRAFT', scopeType: 'SYSTEM', distributionPolicy: 'REQUIRED' }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ versions: [{ id: 'v1', version: 1, lock_json: { mode: 'STRUCTURE_LOCKED' } }] }) }));
    renderWithMessages(<TemplateAdminClient activeStakeId={null} canSystem canStake={false} />);
    expect(await screen.findByText('System source')).toBeInTheDocument();
    await screen.findByText('Version 1');
    expect(screen.getByText('STRUCTURE_LOCKED')).toBeInTheDocument();
    expect(screen.getByText('REQUIRED')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
  });

  it('creates drafts with the canonical schema-valid default layout', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return { ok: true, json: async () => ({ template: { id: 't1', name: 'New draft', status: 'DRAFT', scopeType: 'SYSTEM' } }) } as Response;
      }
      if (String(_input).endsWith('/versions')) {
        return { ok: true, json: async () => ({ versions: [] }) } as Response;
      }
      return { ok: true, json: async () => ({ templates: [] }) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithMessages(<TemplateAdminClient activeStakeId={null} canSystem canStake={false} />);

    await user.click(await screen.findByRole('button', { name: 'New draft' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true));

    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    const payload = JSON.parse(String(postCall?.[1]?.body)) as { layout: unknown };
    expect(() => parseTemplateLayout(payload.layout)).not.toThrow();
  });
});
