export type SourceAdapterErrorCode =
  | 'google-drive-fetch-failed'
  | 'google-drive-no-readable-documents'
  | 'google-drive-not-connected'
  | 'google-drive-rate-limited'
  | 'google-drive-resource-not-found'
  | 'google-drive-unauthorized'
  | 'github-branch-not-found'
  | 'github-fetch-failed'
  | 'github-markdown-file-too-large'
  | 'github-markdown-total-too-large'
  | 'github-no-markdown-files'
  | 'github-rate-limited'
  | 'github-repo-not-found'
  | 'github-token-missing'
  | 'github-too-many-markdown-files'
  | 'github-unauthorized'
  | 'invalid-github-url'
  | 'invalid-input'
  | 'notion-fetch-failed'
  | 'notion-no-readable-pages'
  | 'notion-not-connected'
  | 'notion-rate-limited'
  | 'notion-resource-not-found'
  | 'notion-unauthorized'
  | 'unsupported-github-host';

export class SourceAdapterError extends Error {
  code: SourceAdapterErrorCode;
  status: number;

  constructor(code: SourceAdapterErrorCode, message: string, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
