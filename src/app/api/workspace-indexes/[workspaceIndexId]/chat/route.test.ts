import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/workspace-indexes/[workspaceIndexId]/chat/route';
import { ChatProviderError } from '@/lib/providers/chat-provider';

import type { NextRequest } from 'next/server';
import type { WorkspaceIndexRouteContext } from '@/lib/api/request';

const workspaceIndexId = '00000000-0000-4000-8000-000000001301';
const vaultId = '00000000-0000-4000-8000-000000001302';
const chatSessionId = '00000000-0000-4000-8000-000000001304';
const userMessageId = '00000000-0000-4000-8000-000000001305';
const assistantMessageId = '00000000-0000-4000-8000-000000001306';
const chunkId = '00000000-0000-4000-8000-000000001308';
const documentId = '00000000-0000-4000-8000-000000001309';
const sourceId = '00000000-0000-4000-8000-000000001310';

const workspaceIndex = {
  id: workspaceIndexId,
  vaultId,
};

const mocks = vi.hoisted(() => ({
  generateAnswer: vi.fn(),
  getLocale: vi.fn(),
  getWorkspaceIndexDetail: vi.fn(),
  loggerError: vi.fn(),
  prepareChatAnswer: vi.fn(),
  requireWorkspaceIndexDocsReadForRequest: vi.fn(),
  streamPreparedAnswer: vi.fn(),
}));

vi.mock('@/db/queries/workspace-indexes', () => ({
  getWorkspaceIndexDetail: mocks.getWorkspaceIndexDetail,
}));

vi.mock('@/lib/access/api-access', () => ({
  requireWorkspaceIndexDocsReadForRequest: mocks.requireWorkspaceIndexDocsReadForRequest,
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

function createRequest(body: Record<string, unknown>): NextRequest {
  return new Request(`http://localhost:3000/api/workspace-indexes/${workspaceIndexId}/chat`, {
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
  }) as NextRequest;
}

function createContext(
  overrides: Partial<{
    workspaceIndexId: string;
  }> = {},
): WorkspaceIndexRouteContext {
  return {
    params: Promise.resolve({
      workspaceIndexId,
      ...overrides,
    }),
  };
}

function createAnswerResult(answer = 'The repository documents the export command. [1]') {
  return {
    answer,
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
        path: 'docs/exporting-data.md',
        similarity: 0.92,
        snippet: 'Run the export command.',
        sourceId,
        sourceName: 'Engineering docs',
        sourceType: 'github',
        title: 'Exporting data',
        workspaceIndexId,
        workspaceIndexName: 'Engineering',
      },
    ],
    userMessage: {
      id: userMessageId,
      role: 'user',
    },
    workspaceIndexId,
  };
}

function createPreparedAnswer() {
  return {
    answerOverride: null,
    chatSessionId,
    db: {},
    promptMessages: [
      {
        content: 'Answer from indexed context.',
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
    workspaceIndexId,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireWorkspaceIndexDocsReadForRequest.mockResolvedValue({
    context: {
      permissions: ['docs.read'],
      roles: [],
      userId: 'user_123',
      vaultId,
    },
    ok: true,
    session: {
      user: {
        id: 'user_123',
      },
    },
    workspaceIndex,
  });
  mocks.getWorkspaceIndexDetail.mockResolvedValue({ workspaceIndex });
  mocks.getLocale.mockResolvedValue('en');
  mocks.generateAnswer.mockResolvedValue(createAnswerResult());
  mocks.prepareChatAnswer.mockResolvedValue(createPreparedAnswer());
  mocks.streamPreparedAnswer.mockImplementation(
    async ({ onToken }: { onToken: (token: string) => void }) => {
      onToken('Ready');

      return createAnswerResult('Ready. [1]');
    },
  );
});

describe('/api/workspace-indexes/[workspaceIndexId]/chat', () => {
  it('generates a non-streaming answer from the workspace index', async () => {
    const response = await POST(
      createRequest({ message: 'How do I export data?' }),
      createContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      answer: 'The repository documents the export command. [1]',
      chatSessionId,
      messages: {
        assistant: { id: assistantMessageId },
        user: { id: userMessageId },
      },
      ok: true,
      sources: [{ path: 'docs/exporting-data.md' }],
      workspaceIndexId,
    });
    expect(response.status).toBe(200);
    expect(mocks.generateAnswer).toHaveBeenCalledWith({
      answerLanguage: 'en',
      question: 'How do I export data?',
      workspaceIndexId,
    });
  });

  it('continues an existing chat session', async () => {
    const response = await POST(
      createRequest({
        chatSessionId,
        message: 'And how long is it retained?',
      }),
      createContext(),
    );

    expect(response.status).toBe(200);
    expect(mocks.generateAnswer).toHaveBeenCalledWith({
      answerLanguage: 'en',
      chatSessionId,
      question: 'And how long is it retained?',
      workspaceIndexId,
    });
  });

  it('streams prepared chat answers over server-sent events', async () => {
    const response = await POST(
      createRequest({ message: 'Stream the answer.', stream: true }),
      createContext(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    const body = await response.text();
    expect(body).toContain('event: session');
    expect(body).toContain('event: sources');
    expect(body).toContain('event: token');
    expect(body).toContain('Ready');
    expect(body).toContain('event: done');
    expect(mocks.prepareChatAnswer).toHaveBeenCalledWith({
      answerLanguage: 'en',
      question: 'Stream the answer.',
      workspaceIndexId,
    });
    expect(mocks.generateAnswer).not.toHaveBeenCalled();
  });

  it('rejects invalid route params before auth', async () => {
    const response = await POST(
      createRequest({ message: 'How do I export data?' }),
      createContext({ workspaceIndexId: 'not-a-uuid' }),
    );

    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'invalid-input' },
      ok: false,
    });
    expect(response.status).toBe(400);
    expect(mocks.requireWorkspaceIndexDocsReadForRequest).not.toHaveBeenCalled();
  });

  it('rejects invalid request bodies before retrieval', async () => {
    const response = await POST(createRequest({ message: '' }), createContext());

    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'invalid-input' },
      ok: false,
    });
    expect(response.status).toBe(400);
    expect(mocks.getWorkspaceIndexDetail).not.toHaveBeenCalled();
    expect(mocks.generateAnswer).not.toHaveBeenCalled();
  });

  it('returns not found when the workspace index is missing', async () => {
    mocks.getWorkspaceIndexDetail.mockResolvedValue(null);

    const response = await POST(
      createRequest({ message: 'How do I export data?' }),
      createContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'not-found' },
      ok: false,
    });
    expect(response.status).toBe(404);
    expect(mocks.generateAnswer).not.toHaveBeenCalled();
  });

  it('maps chat provider errors to chat API errors', async () => {
    mocks.generateAnswer.mockRejectedValue(
      new ChatProviderError('chat-provider-error', 'OpenAI request failed.'),
    );

    const response = await POST(
      createRequest({ message: 'How do I export data?' }),
      createContext(),
    );

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
