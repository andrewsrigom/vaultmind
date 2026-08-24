import { Buffer } from 'node:buffer';
import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createGitHubOAuthState, parseGitHubOAuthState } from '@/lib/sources/github/oauth-state';
import {
  createGoogleDriveOAuthState,
  parseGoogleDriveOAuthState,
} from '@/lib/sources/google-drive/oauth-state';
import { createNotionOAuthState, parseNotionOAuthState } from '@/lib/sources/notion/oauth-state';

const backslashReturnPath = '/\\evil.example/path';
const secret = 'oauth-state-test-secret';

function createSignedState(value: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret).update(payload, 'utf8').digest('base64url');

  return `${payload}.${signature}`;
}

describe('OAuth state return paths', () => {
  it('replaces backslash paths with the integrations fallback when creating state', () => {
    const githubState = createGitHubOAuthState({
      returnTo: backslashReturnPath,
      secret,
      sourceId: 'source-id',
      workspaceIndexId: 'workspace-index-id',
    });
    const notionState = createNotionOAuthState({
      returnTo: backslashReturnPath,
      secret,
      workspaceIndexId: 'workspace-index-id',
    });
    const googleDriveState = createGoogleDriveOAuthState({
      returnTo: backslashReturnPath,
      secret,
      workspaceIndexId: 'workspace-index-id',
    });

    expect(parseGitHubOAuthState({ secret, state: githubState })?.returnTo).toBe('/integrations');
    expect(parseNotionOAuthState({ secret, state: notionState })?.returnTo).toBe('/integrations');
    expect(parseGoogleDriveOAuthState({ secret, state: googleDriveState })?.returnTo).toBe(
      '/integrations',
    );
  });

  it('rejects correctly signed legacy state containing a backslash path', () => {
    const createdAt = Date.now();
    const githubState = createSignedState({
      createdAt,
      returnTo: backslashReturnPath,
      sourceId: 'source-id',
      workspaceIndexId: 'workspace-index-id',
    });
    const notionState = createSignedState({
      createdAt,
      returnTo: backslashReturnPath,
      workspaceIndexId: 'workspace-index-id',
    });
    const googleDriveState = createSignedState({
      createdAt,
      returnTo: backslashReturnPath,
      workspaceIndexId: 'workspace-index-id',
    });

    expect(parseGitHubOAuthState({ secret, state: githubState })).toBeNull();
    expect(parseNotionOAuthState({ secret, state: notionState })).toBeNull();
    expect(parseGoogleDriveOAuthState({ secret, state: googleDriveState })).toBeNull();
  });
});
