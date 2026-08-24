import { describe, expect, it } from 'vitest';

import {
  createWorkspaceIndexSchema,
  updateWorkspaceIndexSchema,
} from '@/lib/validators/workspace-index';

describe('workspace index validators', () => {
  it('normalizes create input', () => {
    expect(
      createWorkspaceIndexSchema.parse({
        branch: '',
        description: '',
        name: '  My KB  ',
        repoUrl: 'https://github.com/openai/openai-cookbook',
      }),
    ).toEqual({
      branch: 'main',
      description: null,
      excludePaths: [],
      includePaths: [],
      name: 'My KB',
      repoUrl: 'https://github.com/openai/openai-cookbook',
      sourceType: 'github',
    });
  });

  it('rejects local folder create input', () => {
    expect(
      createWorkspaceIndexSchema.safeParse({
        description: '',
        excludePaths: ['archive'],
        includePaths: ['notes'],
        name: '  My Local KB  ',
        rootPath: '/Users/example/Vault',
        sourceType: 'local-folder',
      }).success,
    ).toBe(false);
  });

  it('rejects empty names', () => {
    expect(
      updateWorkspaceIndexSchema.safeParse({
        description: 'Valid',
        name: '',
      }).success,
    ).toBe(false);
  });
});
