import { SourceAdapterError } from '@/lib/sources/errors';
import { createGoogleDriveSourceAdapter } from '@/lib/sources/google-drive/google-drive-source-adapter';
import { createGitHubSourceAdapter } from '@/lib/sources/github/github-source-adapter';
import { createNotionSourceAdapter } from '@/lib/sources/notion/notion-source-adapter';

import type { SourceAdapter, SourceType } from '@/lib/sources/types';

export function getSourceAdapter(type: SourceType): SourceAdapter {
  if (type === 'github') {
    return createGitHubSourceAdapter();
  }

  if (type === 'google-drive') {
    return createGoogleDriveSourceAdapter();
  }

  if (type === 'notion') {
    return createNotionSourceAdapter();
  }

  throw new SourceAdapterError('invalid-input', `Unsupported source type: ${type}.`, 400);
}
