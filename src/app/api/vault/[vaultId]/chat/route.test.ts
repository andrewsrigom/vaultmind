import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/vault/[vaultId]/chat/route';
import { ChatProviderError } from '@/lib/providers/chat-provider';

import type { NextRequest } from 'next/server';

const vaultId = '00000000-0000-4000-8000-000000001401';
const primaryWorkspaceIndexId = '00000000-0000-4000-8000-000000001402';
const secondaryWorkspaceIndexId = '00000000-0000-4000-8000-000000001403';
const emptyWorkspaceIndexId = '00000000-0000-4000-8000-000000001404';
const areaId = '00000000-0000-4000-8000-000000001407';
const chatSessionId = '00000000-0000-4000-8000-000000001408';
const userMessageId = '00000000-0000-4000-8000-000000001409';
const assistantMessageId = '00000000-0000-4000-8000-000000001410';
const chunkId = '00000000-0000-4000-8000-000000001411';
const documentId = '00000000-0000-4000-8000-000000001412';
const sourceId = '00000000-0000-4000-8000-000000001413';

const mocks = vi.hoisted(() => ({
  generateAnswer: vi.fn(),
  getLocale: vi.fn(),
  getVaultById: vi.fn(),
  getWorkspaceArea: vi.fn(),
  listWorkspaceIndexes: vi.fn(),
  loggerError: vi.fn(),
  prepareChatAnswer: vi.fn(),
  requireVaultDocsReadForRequest: vi.fn(),
  streamPreparedAnswer: vi.fn(),
}));

vi.mock('@/db/queries/vaults', () => ({
  getVaultById: mocks.getVaultById,
}));

vi.mock('@/db/queries/workspace-areas', () => ({
  getWorkspaceArea: mocks.getWorkspaceArea,
}));

vi.mock('@/db/queries/workspace-indexes', () => ({
  listWorkspaceIndexes: mocks.listWorkspaceIndexes,
}));

vi.mock('@/lib/access/api-access', () => ({
  requireVaultDocsReadForRequest: mocks.requireVaultDocsReadForRequest,
}));

vi.mock('@/lib/i18n-server', () => ({
  getLocale: mocks.getLocale,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: mocks.loggerError,
  }),
}));

vi.mock('@/lib/rag/generate-answer', () => ({
  generateAnswer: mocks.generateAnswer,
  prepareChatAnswer: mocks.prepareChatAnswer,
  streamPreparedAnswer: mocks.streamPreparedAnswer,
}));

type RouteContext = Parameters<typeof POST>[1];

function createRequest(body: Record<string, unknown>): NextRequest {
  return new Request(`http://localhost:3000/api/vault/${vaultId}/chat`, {
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
  }) as NextRequest;
}

function createContext(overrides: Partial<{ vaultId: string }> = {}): RouteContext {
  return {
    params: Promise.resolve({
      vaultId,
      ...overrides,
    }),
  };
}

function createWorkspaceIndexes() {
  return [
    {
      chunkCount: 7,
      id: primaryWorkspaceIndexId,
      name: 'Engineering docs',
      vaultId,
    },
    {
      chunkCount: 3,
      id: secondaryWorkspaceIndexId,
      name: 'Personal notes',
      vaultId,
    },
    {
      chunkCount: 0,
      id: emptyWorkspaceIndexId,
      name: 'Empty docs',
      vaultId,
    },
  ];
}

function createAnswerResult() {
  return {
    answer: 'The vault combines the repository guide and personal notes. [1]',
    assistantMessage: {
      id: assistantMessageId,
      role: 'assistant',
    },
    chatSessionId,
    sources: [
      {
        chunkId,
        citationIndex: 1,
        documentId,
        path: 'notion/data-retention.md',
        similarity: 0.91,
        snippet: 'Keep exported records for 30 days.',
        sourceId,
        sourceName: 'Personal notes',
        sourceType: 'notion',
        title: 'Data retention',
        workspaceIndexId: secondaryWorkspaceIndexId,
        workspaceIndexName: 'Personal notes',
      },
    ],
    userMessage: {
      id: userMessageId,
      role: 'user',
    },
    workspaceIndexId: secondaryWorkspaceIndexId,
  };
}

function createPreparedAnswer() {
  return {
    answerOverride: null,
    chatSessionId,
    db: {},
    promptMessages: [
      {
        content: 'Answer from vault context.',
        role: 'system',
      },
    ],
    refusalReason: null,
    sources: createAnswerResult().sources,
    userMessage: {
      id: userMessageId,
      role: 'user',
    },
    workspaceAreaId: null,
    workspaceIndexId: primaryWorkspaceIndexId,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireVaultDocsReadForRequest.mockResolvedValue({
    context: {
      permissions: ['docs.read'],
      roles: [],
      userId: 'user_123',
      vaultId,
    },
    ok: true,
    session: { user: { id: 'user_123' } },
    vaultId,
  });
  mocks.getVaultById.mockResolvedValue({ id: vaultId, name: 'Personal' });
  mocks.getWorkspaceArea.mockResolvedValue({ id: areaId, vaultId });
  mocks.listWorkspaceIndexes.mockResolvedValue(createWorkspaceIndexes());
  mocks.getLocale.mockResolvedValue('en');
  mocks.generateAnswer.mockResolvedValue(createAnswerResult());
  mocks.prepareChatAnswer.mockResolvedValue(createPreparedAnswer());
  mocks.streamPreparedAnswer.mockImplementation(
    async ({ onToken }: { onToken: (token: string) => void }) => {
      onToken('Vault ready');

      return createAnswerResult();
    },
  );
});

describe('/api/vault/[vaultId]/chat', () => {
  it('generates an answer across every searchable area', async () => {
    const response = await POST(
      createRequest({ message: 'What do my sources say about exports?' }),
      createContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      answer: 'The vault combines the repository guide and personal notes. [1]',
      chatSessionId,
      ok: true,
      sources: [{ path: 'notion/data-retention.md' }],
      workspaceIndexId: secondaryWorkspaceIndexId,
    });
    expect(response.status).toBe(200);
    expect(mocks.generateAnswer).toHaveBeenCalledWith({
      answerLanguage: 'en',
      question: 'What do my sources say about exports?',
      retrievalWorkspaceIndexIds: [primaryWorkspaceIndexId, secondaryWorkspaceIndexId],
      workspaceIndexId: primaryWorkspaceIndexId,
    });
  });

  it('passes area and chat-session scope into retrieval', async () => {
    const response = await POST(
      createRequest({
        areaId,
        chatSessionId,
        message: 'What changed in these notes?',
      }),
      createContext(),
    );

    expect(response.status).toBe(200);
    expect(mocks.getWorkspaceArea).toHaveBeenCalledWith({
      vaultId,
      workspaceAreaId: areaId,
    });
    expect(mocks.generateAnswer).toHaveBeenCalledWith({
      answerLanguage: 'en',
      chatSessionId,
      question: 'What changed in these notes?',
      retrievalWorkspaceIndexIds: [primaryWorkspaceIndexId, secondaryWorkspaceIndexId],
      workspaceAreaId: areaId,
      workspaceIndexId: primaryWorkspaceIndexId,
    });
  });

  it('streams answers from the prepared chat pipeline', async () => {
    const response = await POST(
      createRequest({ message: 'Stream vault context.', stream: true }),
      createContext(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    const body = await response.text();
    expect(body).toContain('event: session');
    expect(body).toContain('event: token');
    expect(body).toContain('Vault ready');
    expect(body).toContain('event: done');
    expect(mocks.prepareChatAnswer).toHaveBeenCalledWith({
      answerLanguage: 'en',
      question: 'Stream vault context.',
      retrievalWorkspaceIndexIds: [primaryWorkspaceIndexId, secondaryWorkspaceIndexId],
      workspaceIndexId: primaryWorkspaceIndexId,
    });
    expect(mocks.generateAnswer).not.toHaveBeenCalled();
  });

  it('rejects invalid route params before auth', async () => {
    const response = await POST(
      createRequest({ message: 'What is indexed?' }),
      createContext({ vaultId: 'not-a-uuid' }),
    );

    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'invalid-input' },
      ok: false,
    });
    expect(response.status).toBe(400);
    expect(mocks.requireVaultDocsReadForRequest).not.toHaveBeenCalled();
  });

  it('returns not found when the vault is missing', async () => {
    mocks.getVaultById.mockResolvedValue(null);

    const response = await POST(createRequest({ message: 'What is indexed?' }), createContext());

    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'not-found' },
      ok: false,
    });
    expect(response.status).toBe(404);
    expect(mocks.listWorkspaceIndexes).not.toHaveBeenCalled();
  });

  it('returns not found when the selected area is outside the vault', async () => {
    mocks.getWorkspaceArea.mockResolvedValue(null);

    const response = await POST(
      createRequest({ areaId, message: 'What is indexed?' }),
      createContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'not-found' },
      ok: false,
    });
    expect(response.status).toBe(404);
    expect(mocks.generateAnswer).not.toHaveBeenCalled();
  });

  it('blocks chat when no synced documents are searchable', async () => {
    mocks.listWorkspaceIndexes.mockResolvedValue([
      {
        chunkCount: 0,
        id: emptyWorkspaceIndexId,
        name: 'Empty docs',
        vaultId,
      },
    ]);

    const response = await POST(createRequest({ message: 'What is indexed?' }), createContext());

    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'source-not-configured' },
      ok: false,
    });
    expect(response.status).toBe(409);
    expect(mocks.generateAnswer).not.toHaveBeenCalled();
  });

  it('maps chat provider errors to chat API errors', async () => {
    mocks.generateAnswer.mockRejectedValue(
      new ChatProviderError('chat-provider-error', 'OpenAI request failed.'),
    );

    const response = await POST(createRequest({ message: 'What is indexed?' }), createContext());

    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'chat-provider-error',
        message: 'OpenAI request failed.',
      },
      ok: false,
    });
    expect(response.status).toBe(502);
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });
});
