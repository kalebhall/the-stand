// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import { MESSAGE_CATALOGS } from '@/src/i18n/messages';
import { TemplateStudioClient } from './template-studio-client';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const layout = {
  theme: { fontFamily: 'SYSTEM_SANS', baseFontSize: 12, accentColor: '#000000' },
  pages: [{ regions: [{ blocks: [{ id: 'block-1', type: 'TEXT', config: { text: 'Content' } }] }] }]
};

function renderWithMessages(scopeType: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ template: { name: 'Scoped template', status: 'DRAFT', scopeType, version: { version: 1, layout } } })
    })
  );
  return render(
    <NextIntlClientProvider locale="en-US" messages={MESSAGE_CATALOGS['en-US']}>
      <TemplateStudioClient templateId="template-1" canEdit advancedEditing={false} apiBase="/api/templates" />
    </NextIntlClientProvider>
  );
}

describe('TemplateStudioClient', () => {
  it('labels ward-scoped templates as ward templates', async () => {
    renderWithMessages('WARD');
    expect(await screen.findByText(/Ward Templates/)).toBeInTheDocument();
  });

  it('labels personal drafts as the current user’s drafts', async () => {
    renderWithMessages('PERSONAL_DRAFT');
    expect(await screen.findByText(/My Drafts/)).toBeInTheDocument();
  });
});
