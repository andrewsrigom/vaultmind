import { describe, expect, it } from 'vitest';

import { getWorkspaceSourceTypeLabel } from '@/lib/source-type-labels';

describe('getWorkspaceSourceTypeLabel', () => {
  it('returns provider labels for connected and internal source types', () => {
    expect(getWorkspaceSourceTypeLabel('github')).toBe('GitHub');
    expect(getWorkspaceSourceTypeLabel('notion')).toBe('Notion');
    expect(getWorkspaceSourceTypeLabel('google-drive')).toBe('Google Drive');
    expect(getWorkspaceSourceTypeLabel('workspace-doc')).toBe('Internal doc');
  });
});
