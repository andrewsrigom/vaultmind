import { describe, expect, it } from 'vitest';

import {
  branchSchema,
  createWorkspaceSourceSchema,
  githubSourceConfigSchema,
  parsePathFilterText,
} from '@/lib/validators/source';

describe('source validators', () => {
  it('defaults an empty branch to main', () => {
    expect(branchSchema.parse('')).toBe('main');
  });

  it('accepts GitHub source config without secrets', () => {
    expect(
      githubSourceConfigSchema.parse({
        branch: 'main',
        owner: 'openai',
        repo: 'openai-cookbook',
        repoUrl: 'https://github.com/openai/openai-cookbook',
      }),
    ).toEqual({
      branch: 'main',
      excludePaths: [],
      includePaths: [],
      owner: 'openai',
      repo: 'openai-cookbook',
      repoUrl: 'https://github.com/openai/openai-cookbook',
    });
  });

  it('normalizes path filter text', () => {
    expect(parsePathFilterText(' docs/\n/docs/guides\n\ndocs/ ')).toEqual(['docs', 'docs/guides']);
  });

  it('rejects unknown config keys such as tokens', () => {
    expect(
      githubSourceConfigSchema.safeParse({
        branch: 'main',
        owner: 'openai',
        repo: 'openai-cookbook',
        repoUrl: 'https://github.com/openai/openai-cookbook',
        token: 'test-token-that-must-not-be-stored',
      }).success,
    ).toBe(false);
  });

  it('rejects local folder source creation input', () => {
    expect(
      createWorkspaceSourceSchema.safeParse({
        rootPath: '/Users/example/Vault',
        sourceType: 'local-folder',
      }).success,
    ).toBe(false);
  });
});
