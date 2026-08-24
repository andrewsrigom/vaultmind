import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ConnectedSourcesPanel } from '@/components/integrations/connected-sources-panel';
import { getDictionary } from '@/lib/i18n';

vi.mock('next/navigation', () => ({
  usePathname: () => '/vault/acme/integrations',
  useRouter: () => ({
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams('workspaceIndexId=space-1&notion=connected'),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    loading: vi.fn(),
    success: vi.fn(),
  },
}));

describe('ConnectedSourcesPanel', () => {
  it('shows an explicit manual sync action after OAuth connection', () => {
    const dictionary = getDictionary('en');
    const markup = renderToStaticMarkup(
      <ConnectedSourcesPanel
        connectedOAuthSourceId="source-1"
        connectionStatus={{
          provider: 'notion',
          status: 'connected',
        }}
        initialSources={[
          {
            createdAt: '2026-08-04T10:00:00.000Z',
            id: 'source-1',
            lastSyncedAt: null,
            latestSyncStatus: 'not-synced',
            name: 'Engineering Notion',
            resourceCount: 3,
            type: 'notion',
            updatedAt: '2026-08-04T10:00:00.000Z',
            workspaceIndexId: 'space-1',
            workspaceIndexName: 'Engineering',
          },
        ]}
        locale="en"
        sourceStrings={dictionary.source}
        strings={dictionary.integrations.sourceManagement}
      />,
    );

    expect(markup).toContain('Source connected.');
    expect(markup).toContain('Engineering Notion');
    expect(markup).toContain('Space:');
    expect(markup).toContain('Engineering');
    expect(markup).toContain('Sync now');
    expect(markup).not.toContain('Source connected. Starting sync.');
  });
});
