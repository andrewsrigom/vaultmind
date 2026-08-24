export type GitHubRepoUrlErrorCode = 'invalid-github-url' | 'unsupported-github-host';

export class GitHubRepoUrlError extends Error {
  code: GitHubRepoUrlErrorCode;

  constructor(code: GitHubRepoUrlErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export type ParsedGitHubRepoUrl = {
  owner: string;
  repo: string;
  repoUrl: string;
};

const githubOwnerPattern = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/iu;
const githubRepoPattern = /^[a-z\d._-]{1,100}$/iu;

export function parseGitHubRepoUrl(input: string): ParsedGitHubRepoUrl {
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    throw new GitHubRepoUrlError('invalid-github-url', 'Use a valid GitHub.com repository URL.');
  }

  if (url.protocol !== 'https:') {
    throw new GitHubRepoUrlError('invalid-github-url', 'Use an HTTPS GitHub.com repository URL.');
  }

  if (url.hostname.toLowerCase() !== 'github.com') {
    throw new GitHubRepoUrlError(
      'unsupported-github-host',
      'Only github.com repositories are supported in the current release.',
    );
  }

  if (url.hash || url.password || url.search || url.username) {
    throw new GitHubRepoUrlError(
      'invalid-github-url',
      'Use the repository URL without credentials, query string, or hash.',
    );
  }

  const pathSegments = url.pathname.split('/').filter(Boolean);

  const owner = pathSegments[0];
  const rawRepo = pathSegments[1];

  if (pathSegments.length !== 2 || !owner || !rawRepo) {
    throw new GitHubRepoUrlError(
      'invalid-github-url',
      'Use the repository root URL, for example https://github.com/owner/repo.',
    );
  }

  const repo = rawRepo.endsWith('.git') ? rawRepo.slice(0, -4) : rawRepo;

  if (!githubOwnerPattern.test(owner) || !githubRepoPattern.test(repo)) {
    throw new GitHubRepoUrlError(
      'invalid-github-url',
      'The GitHub owner or repository name is invalid.',
    );
  }

  return {
    owner,
    repo,
    repoUrl: `https://github.com/${owner}/${repo}`,
  };
}
