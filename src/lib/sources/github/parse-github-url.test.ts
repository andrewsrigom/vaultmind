import { describe, expect, it } from 'vitest';

import { GitHubRepoUrlError, parseGitHubRepoUrl } from '@/lib/sources/github/parse-github-url';

function expectGitHubUrlError(input: string, code: GitHubRepoUrlError['code']) {
  try {
    parseGitHubRepoUrl(input);
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(GitHubRepoUrlError);

    if (error instanceof GitHubRepoUrlError) {
      expect(error.code).toBe(code);
      return;
    }
  }

  throw new Error('Expected GitHubRepoUrlError.');
}

describe('parseGitHubRepoUrl', () => {
  it('parses canonical GitHub.com repository URLs', () => {
    expect(parseGitHubRepoUrl('https://github.com/openai/openai-cookbook')).toEqual({
      owner: 'openai',
      repo: 'openai-cookbook',
      repoUrl: 'https://github.com/openai/openai-cookbook',
    });
  });

  it('normalizes trailing slash and .git suffix', () => {
    expect(parseGitHubRepoUrl('https://github.com/openai/openai-cookbook.git/')).toEqual({
      owner: 'openai',
      repo: 'openai-cookbook',
      repoUrl: 'https://github.com/openai/openai-cookbook',
    });
  });

  it('rejects non-GitHub.com hosts', () => {
    expectGitHubUrlError(
      'https://github.enterprise.example.com/openai/openai-cookbook',
      'unsupported-github-host',
    );
  });

  it('rejects non-root repository URLs', () => {
    expectGitHubUrlError(
      'https://github.com/openai/openai-cookbook/tree/main',
      'invalid-github-url',
    );
  });

  it('rejects non-HTTPS URLs', () => {
    expectGitHubUrlError('http://github.com/openai/openai-cookbook', 'invalid-github-url');
  });
});
