import { getWorkspaceIndexById } from '@/db/queries/workspace-indexes';
import { isLocalAccessGranted } from '@/lib/access/local-access';
import { apiError } from '@/lib/api/responses';

import type { ApiErrorResponse } from '@/lib/api/responses';
import type { WorkspaceIndex } from '@/db/schema';
import type { NextRequest, NextResponse } from 'next/server';

type VaultAccessContext = {
  vaultId: string;
};

type RequireWorkspaceIndexAccessInput = {
  request: NextRequest;
  workspaceIndexId: string;
};

type RequireVaultAccessForRequestInput = {
  vaultId: string;
  request: NextRequest;
};

type WorkspaceIndexApiAccessGranted = {
  context: VaultAccessContext;
  ok: true;
  workspaceIndex: WorkspaceIndex;
};

type VaultApiAccessGranted = {
  context: VaultAccessContext;
  ok: true;
  vaultId: string;
};

type ApiAccessDenied = {
  ok: false;
  response: NextResponse<ApiErrorResponse>;
};

type BasicApiAccessGranted = {
  ok: true;
};

export type ApiAccessResult = WorkspaceIndexApiAccessGranted | ApiAccessDenied;
export type BasicApiAccessResult = BasicApiAccessGranted | ApiAccessDenied;
export type VaultApiAccessResult = VaultApiAccessGranted | ApiAccessDenied;

function getVaultContext(vaultId: string): VaultAccessContext {
  return { vaultId };
}

function denyLockedAccess(): ApiAccessDenied {
  return {
    ok: false,
    response: apiError('unauthorized', 'Unlock the vault before accessing this resource.', 401),
  };
}

export async function requireApiAccessForRequest(
  request: NextRequest,
): Promise<BasicApiAccessResult> {
  return isLocalAccessGranted(request.headers.get('cookie')) ? { ok: true } : denyLockedAccess();
}

export async function requireVaultAccessForRequest({
  request,
  vaultId,
}: RequireVaultAccessForRequestInput): Promise<VaultApiAccessResult> {
  if (!isLocalAccessGranted(request.headers.get('cookie'))) {
    return denyLockedAccess();
  }

  return {
    context: getVaultContext(vaultId),
    ok: true,
    vaultId,
  };
}

export async function requireWorkspaceIndexAccessForRequest({
  request,
  workspaceIndexId,
}: RequireWorkspaceIndexAccessInput): Promise<ApiAccessResult> {
  if (!isLocalAccessGranted(request.headers.get('cookie'))) {
    return denyLockedAccess();
  }

  const workspaceIndex = await getWorkspaceIndexById(workspaceIndexId);

  if (!workspaceIndex) {
    return {
      ok: false,
      response: apiError('not-found', 'Workspace index was not found.', 404),
    };
  }

  return {
    context: getVaultContext(workspaceIndex.vaultId),
    ok: true,
    workspaceIndex,
  };
}

export async function requireSourceManagementForRequest(input: {
  request: NextRequest;
  workspaceIndexId: string;
}): Promise<ApiAccessResult> {
  return requireWorkspaceIndexAccessForRequest(input);
}

export async function requireSourceReadForRequest(input: {
  request: NextRequest;
  workspaceIndexId: string;
}): Promise<ApiAccessResult> {
  return requireWorkspaceIndexAccessForRequest(input);
}

export async function requireVaultSourceManagementForRequest(input: {
  vaultId: string;
  request: NextRequest;
}): Promise<VaultApiAccessResult> {
  return requireVaultAccessForRequest(input);
}

export async function requireWorkspaceIndexDocsReadForRequest(input: {
  request: NextRequest;
  workspaceIndexId: string;
}): Promise<ApiAccessResult> {
  return requireWorkspaceIndexAccessForRequest(input);
}

export async function requireWorkspaceIndexDocsCreationForRequest(input: {
  request: NextRequest;
  workspaceIndexId: string;
}): Promise<ApiAccessResult> {
  return requireWorkspaceIndexAccessForRequest(input);
}

export async function requireWorkspaceIndexDocsManagementForRequest(input: {
  request: NextRequest;
  workspaceIndexId: string;
}): Promise<ApiAccessResult> {
  return requireWorkspaceIndexAccessForRequest(input);
}

export async function requireAnalyticsReadForRequest(input: {
  request: NextRequest;
  workspaceIndexId: string;
}): Promise<ApiAccessResult> {
  return requireWorkspaceIndexAccessForRequest(input);
}

export async function requireAnalyticsManagementForRequest(input: {
  request: NextRequest;
  workspaceIndexId: string;
}): Promise<ApiAccessResult> {
  return requireWorkspaceIndexAccessForRequest(input);
}

export async function requireVaultDocsReadForRequest(input: {
  vaultId: string;
  request: NextRequest;
}): Promise<VaultApiAccessResult> {
  return requireVaultAccessForRequest(input);
}

export async function requireVaultDocsCreationForRequest(input: {
  vaultId: string;
  request: NextRequest;
}): Promise<VaultApiAccessResult> {
  return requireVaultAccessForRequest(input);
}

export async function requireVaultDocsManagementForRequest(input: {
  vaultId: string;
  request: NextRequest;
}): Promise<VaultApiAccessResult> {
  return requireVaultAccessForRequest(input);
}

export function getOAuthAccessDeniedStatus(responseStatus: number): 'auth-required' | 'forbidden' {
  return responseStatus === 401 ? 'auth-required' : 'forbidden';
}
