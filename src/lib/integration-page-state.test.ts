import { describe, expect, it } from 'vitest';

import {
  appendIntegrationsSearchParams,
  findSelectedTargetSpace,
  getConnectedOAuthSourceId,
} from '@/lib/integration-page-state';

const firstSpace = {
  id: '00000000-0000-4000-8000-000000000101',
  name: 'First space',
};
const secondSpace = {
  id: '00000000-0000-4000-8000-000000000102',
  name: 'Second space',
};

describe('integration page state', () => {
  it('does not select the first space implicitly', () => {
    expect(findSelectedTargetSpace([firstSpace, secondSpace])).toBeUndefined();
    expect(findSelectedTargetSpace([firstSpace, secondSpace], 'unknown')).toBeUndefined();
  });

  it('returns only an explicitly selected space', () => {
    expect(findSelectedTargetSpace([firstSpace, secondSpace], secondSpace.id)).toEqual(secondSpace);
  });

  it('preserves the selected space in OAuth return URLs', () => {
    const href = appendIntegrationsSearchParams({
      href: '/integrations',
      workspaceIndexId: secondSpace.id,
    });

    expect(href).toBe(`/integrations?workspaceIndexId=${secondSpace.id}`);
  });

  it('keeps connection status alongside the selected space', () => {
    const href = appendIntegrationsSearchParams({
      href: '/integrations',
      notion: 'connected',
      workspaceIndexId: secondSpace.id,
    });

    expect(href).toContain(`workspaceIndexId=${secondSpace.id}`);
    expect(href).toContain('notion=connected');
  });

  it('resolves the connected source only inside the selected space', () => {
    const sourceId = getConnectedOAuthSourceId({
      connectionStatus: {
        provider: 'notion',
        status: 'connected',
      },
      sources: [
        {
          id: 'source-in-first-space',
          type: 'notion',
          updatedAt: '2026-08-04T12:00:00.000Z',
          workspaceIndexId: firstSpace.id,
        },
        {
          id: 'older-source-in-second-space',
          type: 'notion',
          updatedAt: '2026-08-04T10:00:00.000Z',
          workspaceIndexId: secondSpace.id,
        },
        {
          id: 'latest-source-in-second-space',
          type: 'notion',
          updatedAt: '2026-08-04T11:00:00.000Z',
          workspaceIndexId: secondSpace.id,
        },
      ],
      workspaceIndexId: secondSpace.id,
    });

    expect(sourceId).toBe('latest-source-in-second-space');
  });
});
