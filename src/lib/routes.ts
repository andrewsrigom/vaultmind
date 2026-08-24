import type { Route } from 'next';

export const allAreasSelectorId = '__all_areas__';

export type WorkspaceIndexSection = 'articles' | 'areas' | 'documents' | 'settings' | 'sources';

type VaultRouteInput = {
  vaultId?: string | null | undefined;
  vaultSlug?: string | null | undefined;
};

type ChatRouteInput = VaultRouteInput & {
  areaId?: string | null | undefined;
  chatSessionId?: string | null | undefined;
  workspaceIndexId?: string | null | undefined;
  prompt?: string | null | undefined;
  scope?: 'vault' | 'workspace' | null | undefined;
};

type WorkspaceIndexRouteInput = VaultRouteInput & {
  workspaceIndexId: string;
  workspaceIndexSlug?: string | null | undefined;
  section?: WorkspaceIndexSection | null | undefined;
};

function appendQuery(path: string, params: URLSearchParams): Route {
  const query = params.toString();

  return toRoute(query ? `${path}?${query}` : path);
}

function toRoute(path: string): Route {
  return path as unknown as Route;
}

function getVaultPathSegment({ vaultId, vaultSlug }: VaultRouteInput): string | null {
  return vaultSlug || vaultId || null;
}

export function createVaultChatHref({
  areaId,
  chatSessionId,
  prompt,
  scope,
  vaultId,
  vaultSlug,
  workspaceIndexId,
}: ChatRouteInput): Route {
  const vaultSegment = getVaultPathSegment({ vaultId, vaultSlug });
  const path = vaultSegment ? `/vault/${vaultSegment}/chat` : '/chat';
  const params = new URLSearchParams();

  if (chatSessionId) {
    params.set('chatSessionId', chatSessionId);
  }

  if (areaId && areaId !== allAreasSelectorId) {
    params.set('areaId', areaId);
  } else if (workspaceIndexId && workspaceIndexId !== allAreasSelectorId) {
    params.set('workspaceIndexId', workspaceIndexId);
  }

  if (prompt) {
    params.set('prompt', prompt);
  }

  if (scope === 'vault') {
    params.set('scope', 'vault');
  }

  return appendQuery(path, params);
}

export function createVaultAskHref({
  chatSessionId,
  prompt,
  vaultId,
  vaultSlug,
}: VaultRouteInput & {
  chatSessionId?: string | null | undefined;
  prompt?: string | null | undefined;
}): Route {
  const vaultSegment = getVaultPathSegment({ vaultId, vaultSlug });
  const path = vaultSegment ? `/vault/${vaultSegment}/ask` : '/ask';
  const params = new URLSearchParams();

  if (chatSessionId) {
    params.set('chatSessionId', chatSessionId);
  }

  if (prompt) {
    params.set('prompt', prompt);
  }

  return appendQuery(path, params);
}

export function createVaultArchiveHref({ vaultId, vaultSlug }: VaultRouteInput): Route {
  const vaultSegment = getVaultPathSegment({ vaultId, vaultSlug });

  return toRoute(vaultSegment ? `/vault/${vaultSegment}/archive` : '/archive');
}

export function createVaultIntegrationsHref({ vaultId, vaultSlug }: VaultRouteInput): Route {
  const vaultSegment = getVaultPathSegment({ vaultId, vaultSlug });

  return toRoute(vaultSegment ? `/vault/${vaultSegment}/integrations` : '/integrations');
}

export function createVaultSettingsHref({ vaultId, vaultSlug }: VaultRouteInput): Route {
  const vaultSegment = getVaultPathSegment({ vaultId, vaultSlug });

  return toRoute(vaultSegment ? `/vault/${vaultSegment}/settings` : '/settings');
}

export function createVaultArticlesHref({
  areaId,
  vaultId,
  vaultSlug,
}: VaultRouteInput & {
  areaId?: string | null | undefined;
}): Route {
  const vaultSegment = getVaultPathSegment({ vaultId, vaultSlug });
  const path = vaultSegment ? `/vault/${vaultSegment}/articles` : '/articles';
  const params = new URLSearchParams();

  if (areaId && areaId !== allAreasSelectorId) {
    params.set('areaId', areaId);
  }

  return appendQuery(path, params);
}

export function createVaultArticleHref({
  articleId,
  vaultId,
  vaultSlug,
}: {
  articleId: string;
  vaultId: string;
  vaultSlug?: string | null | undefined;
}): Route {
  const vaultSegment = getVaultPathSegment({ vaultId, vaultSlug });

  return toRoute(`/vault/${vaultSegment}/articles/${articleId}`);
}

export function createVaultArticleEditHref({
  articleId,
  vaultId,
  vaultSlug,
}: {
  articleId: string;
  vaultId: string;
  vaultSlug?: string | null | undefined;
}): Route {
  const vaultSegment = getVaultPathSegment({ vaultId, vaultSlug });

  return toRoute(`/vault/${vaultSegment}/articles/${articleId}/edit`);
}

export function createVaultDocumentHref({
  areaId,
  articleId,
  documentId,
  vaultId,
  vaultSlug,
}: {
  areaId?: string | null | undefined;
  articleId?: string | null | undefined;
  documentId: string;
  vaultId: string;
  vaultSlug?: string | null | undefined;
}): Route {
  const params = new URLSearchParams();
  const vaultSegment = getVaultPathSegment({ vaultId, vaultSlug });

  if (areaId) {
    params.set('areaId', areaId);
  }

  if (articleId) {
    params.set('articleId', articleId);
  }

  return appendQuery(`/vault/${vaultSegment}/documents/${documentId}`, params);
}

export function createVaultDocHref({
  docId,
  docSlug,
  vaultId,
  vaultSlug,
}: {
  docId: string;
  docSlug?: string | null | undefined;
  vaultId: string;
  vaultSlug?: string | null | undefined;
}): Route {
  const vaultSegment = getVaultPathSegment({ vaultId, vaultSlug });
  const docSegment = docSlug ? `${docSlug}/${docId}` : docId;

  return toRoute(`/vault/${vaultSegment}/docs/${docSegment}`);
}

export function createVaultWorkspaceIndexesHref({ vaultId, vaultSlug }: VaultRouteInput): Route {
  const vaultSegment = getVaultPathSegment({ vaultId, vaultSlug });

  return toRoute(vaultSegment ? `/vault/${vaultSegment}/areas` : '/areas');
}

export function createVaultAreaHref({
  areaId,
  areaSlug,
  vaultId,
  vaultSlug,
}: {
  areaId: string;
  areaSlug?: string | null | undefined;
  vaultId: string;
  vaultSlug?: string | null | undefined;
}): Route {
  const vaultSegment = getVaultPathSegment({ vaultId, vaultSlug });

  return toRoute(`/vault/${vaultSegment}/areas/${areaSlug || areaId}`);
}

export function createWorkspaceIndexHref({
  section,
  vaultId,
  vaultSlug,
  workspaceIndexId,
  workspaceIndexSlug,
}: WorkspaceIndexRouteInput): Route {
  const vaultSegment = getVaultPathSegment({ vaultId, vaultSlug });
  const workspaceIndexSegment = workspaceIndexSlug || workspaceIndexId;
  const base = vaultSegment
    ? `/vault/${vaultSegment}/areas/${workspaceIndexSegment}`
    : `/areas/${workspaceIndexSegment}`;

  return toRoute(section ? `${base}/${section}` : base);
}

export function createWorkspaceIndexDocumentsHref({
  sourceId,
  vaultId,
  vaultSlug,
  workspaceIndexId,
  workspaceIndexSlug,
}: WorkspaceIndexRouteInput & {
  sourceId?: string | null | undefined;
}): Route {
  const params = new URLSearchParams();

  if (sourceId) {
    params.set('sourceId', sourceId);
  }

  return appendQuery(
    createWorkspaceIndexHref({
      section: 'documents',
      vaultId,
      vaultSlug,
      workspaceIndexId,
      workspaceIndexSlug,
    }),
    params,
  );
}

export function getWorkspaceIndexIdFromPath(pathname: string): string | null {
  const match = pathname.match(/(?:^\/areas|^\/vault\/[^/]+\/areas)\/(?!new(?:\/|$))([^/]+)/u);

  return match?.[1] ?? null;
}

export function getWorkspaceDocIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/vault\/[^/]+\/docs\/(?:[^/]+\/)?([^/]+)$/u);

  return match?.[1] ?? null;
}

export function isChatPath(pathname: string): boolean {
  return pathname === '/chat' || /^\/vault\/[^/]+\/chat$/u.test(pathname);
}

export function isAskPath(pathname: string): boolean {
  return pathname === '/ask' || /^\/vault\/[^/]+\/ask$/u.test(pathname);
}

export function isArchivePath(pathname: string): boolean {
  return pathname === '/archive' || /^\/vault\/[^/]+\/archive$/u.test(pathname);
}

export function isIntegrationsPath(pathname: string): boolean {
  return pathname === '/integrations' || /^\/vault\/[^/]+\/integrations$/u.test(pathname);
}

export function isSettingsPath(pathname: string): boolean {
  return pathname === '/settings' || /^\/vault\/[^/]+\/settings$/u.test(pathname);
}

export function isArticlesPath(pathname: string): boolean {
  return (
    pathname === '/articles' || /^\/vault\/[^/]+\/articles(?:\/[^/]+(?:\/edit)?)?$/u.test(pathname)
  );
}

export function isDocumentsPath(pathname: string): boolean {
  return /^\/vault\/[^/]+\/documents(?:\/[^/]+)?$/u.test(pathname);
}

export function isWorkspaceDocPath(pathname: string): boolean {
  return /^\/vault\/[^/]+\/docs\/(?:[^/]+\/)?[^/]+$/u.test(pathname);
}

export function isWorkspaceIndexesPath(pathname: string): boolean {
  return pathname === '/areas' || /^\/vault\/[^/]+\/areas$/u.test(pathname);
}
