// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { MESSAGE_CATALOGS } from '@/src/i18n/messages';
import { AdvancedDesignerSetting } from './advanced-designer-setting';

function renderSetting() {
  return render(<NextIntlClientProvider locale="en-US" messages={MESSAGE_CATALOGS['en-US']}><AdvancedDesignerSetting wardId="ward-1" /></NextIntlClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('AdvancedDesignerSetting', () => {
  it('loads disabled ward state and saves through the audited settings API', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ settings: { allowAdvancedProgramDesigner: false } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ settings: { allowAdvancedProgramDesigner: true } }) });
    vi.stubGlobal('fetch', fetchMock);
    renderSetting();
    const toggle = screen.getByRole('button', { name: 'Advanced Program Designer' });
    expect(toggle).toBeDisabled();
    await waitFor(() => expect(toggle).toHaveAttribute('aria-pressed', 'false'));
    expect(toggle).toHaveTextContent('Disabled');
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-pressed', 'true'));
    expect(toggle).toHaveTextContent('Enabled');
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/w/ward-1/program-settings', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/w/ward-1/program-settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ allowAdvancedProgramDesigner: true })
    });
    expect(screen.getByRole('status')).toHaveTextContent('Reopen the designer');
  });

  it('leaves persisted state unchanged and shows a retryable error on save failure', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ settings: { allowAdvancedProgramDesigner: false } }) })
      .mockResolvedValueOnce({ ok: false }));
    renderSetting();
    const toggle = screen.getByRole('button', { name: 'Advanced Program Designer' });
    await waitFor(() => expect(toggle).toBeEnabled());
    fireEvent.click(toggle);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle).toBeEnabled();
  });

  it('does not show an editable default when loading fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ settings: { allowAdvancedProgramDesigner: true } }) });
    vi.stubGlobal('fetch', fetchMock);
    renderSetting();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load');
    const toggle = screen.getByRole('button', { name: 'Advanced Program Designer' });
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveTextContent('Unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
    await waitFor(() => expect(toggle).toHaveAttribute('aria-pressed', 'true'));
    expect(toggle).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('ignores a stale load when the active ward changes', async () => {
    let resolveOld: (value: { ok: boolean; json: () => Promise<unknown> }) => void = () => { throw new Error('Old request not started'); };
    const oldResponse = new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve) => { resolveOld = resolve; });
    const fetchMock = vi.fn()
      .mockReturnValueOnce(oldResponse)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ settings: { allowAdvancedProgramDesigner: true } }) });
    vi.stubGlobal('fetch', fetchMock);
    const provider = (wardId: string) => <NextIntlClientProvider locale="en-US" messages={MESSAGE_CATALOGS['en-US']}><AdvancedDesignerSetting wardId={wardId} /></NextIntlClientProvider>;
    const view = render(provider('ward-1'));
    view.rerender(provider('ward-2'));
    const toggle = screen.getByRole('button', { name: 'Advanced Program Designer' });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-pressed', 'true'));
    resolveOld({ ok: true, json: async () => ({ settings: { allowAdvancedProgramDesigner: false } }) });
    await oldResponse;
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('ignores an old ward save after loading a new ward', async () => {
    let resolveSave: (value: { ok: boolean; json: () => Promise<unknown> }) => void = () => { throw new Error('Save not started'); };
    const oldSave = new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve) => { resolveSave = resolve; });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ settings: { allowAdvancedProgramDesigner: false } }) })
      .mockReturnValueOnce(oldSave)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ settings: { allowAdvancedProgramDesigner: false } }) });
    vi.stubGlobal('fetch', fetchMock);
    const provider = (wardId: string) => <NextIntlClientProvider locale="en-US" messages={MESSAGE_CATALOGS['en-US']}><AdvancedDesignerSetting wardId={wardId} /></NextIntlClientProvider>;
    const view = render(provider('ward-1'));
    const toggle = screen.getByRole('button', { name: 'Advanced Program Designer' });
    await waitFor(() => expect(toggle).toBeEnabled());
    fireEvent.click(toggle);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    view.rerender(provider('ward-2'));
    await waitFor(() => expect(toggle).toHaveTextContent('Disabled'));
    resolveSave({ ok: true, json: async () => ({ settings: { allowAdvancedProgramDesigner: true } }) });
    await oldSave;
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(toggle).toHaveTextContent('Disabled');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
