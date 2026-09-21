// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TemplateAdminClient } from './template-admin-client';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('TemplateAdminClient', () => {
  it('loads explicit system scope and exposes policy, lock, and history controls', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ templates: [{ id: 't1', name: 'System source', status: 'DRAFT', scopeType: 'SYSTEM', distributionPolicy: 'REQUIRED' }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ versions: [{ id: 'v1', version: 1, lock_json: { mode: 'STRUCTURE_LOCKED' } }] }) }));
    render(<TemplateAdminClient activeStakeId={null} canSystem canStake={false} />);
    expect(await screen.findByText('System source')).toBeInTheDocument();
    await screen.findByText('Version 1');
    expect(screen.getByText('STRUCTURE_LOCKED')).toBeInTheDocument();
    expect(screen.getByText('REQUIRED')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
  });
});
