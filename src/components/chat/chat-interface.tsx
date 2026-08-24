'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { ChatInput } from '@/components/chat/chat-input';
import { ChatMessage } from '@/components/chat/chat-message';
import { KnowledgeWorkspaceOverview } from '@/components/chat/knowledge-workspace-overview';
import { SourcePanel } from '@/components/chat/source-panel';
import { createVaultAskHref, createVaultChatHref } from '@/lib/routes';

import type { ChatFeedbackSignal, ChatFeedbackState } from '@/components/chat/chat-message';
import type { ChatDisplayMessage, ChatRetrievedSource } from '@/components/chat/types';
import type { WorkspaceIndexKpiSummary } from '@/db/queries/knowledge-events';
import type { WorkspaceAreaIconName } from '@/db/schema';
import type { Dictionary } from '@/lib/i18n';
import type { ReactNode } from 'react';

type ChatApiMessage = {
  content: string;
  id: string;
  role: 'assistant' | 'user';
};

type ChatApiSuccessResponse = {
  answer: string;
  chatSessionId: string;
  workspaceIndexId?: string;
  messages: {
    assistant: ChatApiMessage;
    user: ChatApiMessage;
  };
  ok: true;
  sources: ChatRetrievedSource[];
};

type ChatApiErrorResponse = {
  error: {
    message: string;
  };
  ok: false;
};

type ChatApiResponse = ChatApiErrorResponse | ChatApiSuccessResponse;

type FeedbackApiResponse =
  | {
      ok: true;
    }
  | {
      error: {
        message: string;
      };
      ok: false;
    };

type ChatStreamDonePayload = Omit<ChatApiSuccessResponse, 'ok'>;

type ChatStreamSessionPayload = {
  chatSessionId: string;
  message: ChatApiMessage;
};

type ChatStreamSourcesPayload = {
  sources: ChatRetrievedSource[];
};

type ChatStreamTokenPayload = {
  token: string;
};

type ChatStreamErrorPayload = {
  message: string;
};

type ParsedStreamEvent = {
  data: string;
  event: string;
};

type ChatInterfaceProps = {
  areaId: string | null;
  disabledAction?: ReactNode;
  disabledReason: string | null;
  emptyStateVariant?: 'input-only' | 'workspace-overview';
  initialChatSessionId: string | null;
  initialMessages: ChatDisplayMessage[];
  initialMessageWorkspaceIndexId: string | null;
  initialPrompt: string;
  initialSources: ChatRetrievedSource[];
  isDisabled: boolean;
  workspaceIndex: {
    chunkCount: number;
    description: string | null;
    documentCount: number;
    id: string;
    icon: WorkspaceAreaIconName;
    kpiSummary: WorkspaceIndexKpiSummary;
    lastSyncedAt: string | null;
    name: string;
    sourceCount: number;
    syncedSourceCount: number;
  } | null;
  workspaceIndexes: Array<{
    chunkCount: number;
    description: string | null;
    documentCount: number;
    id: string;
    icon: WorkspaceAreaIconName;
    kpiSummary: WorkspaceIndexKpiSummary;
    lastSyncedAt: string | null;
    name: string;
    sourceCount: number;
    syncedSourceCount: number;
  }>;
  workspaceIndexId: string | null;
  vaultId: string | null;
  vaultSlug?: string | null;
  strings: Dictionary['chat']['interface'] & {
    input: Dictionary['chat']['input'];
  };
  conversationRoute?: 'ask' | 'chat';
};

function createLocalMessage(role: ChatDisplayMessage['role'], content: string) {
  return {
    content,
    id: `local-${role}-${globalThis.crypto.randomUUID()}`,
    role,
  } satisfies ChatDisplayMessage;
}

function parseStreamEvent(block: string): ParsedStreamEvent | null {
  const lines = block.split(/\r?\n/u);
  const data: string[] = [];
  let event = 'message';

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
      continue;
    }

    if (line.startsWith('data:')) {
      data.push(line.slice('data:'.length).trimStart());
    }
  }

  if (data.length === 0) {
    return null;
  }

  return {
    data: data.join('\n'),
    event,
  };
}

function parseStreamPayload<TPayload>(data: string): TPayload {
  return JSON.parse(data) as TPayload;
}

function replaceMessageById(
  messages: ChatDisplayMessage[],
  messageId: string,
  nextMessage: ChatDisplayMessage,
): ChatDisplayMessage[] {
  return messages.map((message) => (message.id === messageId ? nextMessage : message));
}

export function ChatInterface({
  areaId,
  conversationRoute = 'chat',
  disabledAction = null,
  disabledReason,
  emptyStateVariant = 'workspace-overview',
  initialChatSessionId,
  initialMessages,
  initialMessageWorkspaceIndexId,
  initialPrompt,
  initialSources,
  isDisabled,
  strings,
  vaultId,
  vaultSlug,
  workspaceIndex,
  workspaceIndexes,
  workspaceIndexId,
}: ChatInterfaceProps) {
  const router = useRouter();
  const [inputValue, setInputValue] = useState(initialMessages.length > 0 ? '' : initialPrompt);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentChatSessionId, setCurrentChatSessionId] = useState(initialChatSessionId);
  const [messages, setMessages] = useState<ChatDisplayMessage[]>(initialMessages);
  const [sources, setSources] = useState<ChatRetrievedSource[]>(initialSources);
  const [streamingAssistantMessageId, setStreamingAssistantMessageId] = useState<string | null>(
    null,
  );
  const [feedbackByMessageId, setFeedbackByMessageId] = useState<Record<string, ChatFeedbackState>>(
    {},
  );
  const [workspaceIndexIdByMessageId, setWorkspaceIndexIdByMessageId] = useState<
    Record<string, string>
  >({});
  function applyCompletedResponse(
    payload: ChatStreamDonePayload,
    localAssistantMessageId: string,
    localUserMessageId: string,
  ) {
    setCurrentChatSessionId(payload.chatSessionId);
    setSources(payload.sources);
    setMessages((currentMessages) => {
      const withUserMessage = replaceMessageById(
        currentMessages,
        localUserMessageId,
        payload.messages.user,
      );

      return replaceMessageById(
        withUserMessage,
        localAssistantMessageId,
        payload.messages.assistant,
      );
    });
    const responseWorkspaceIndexId = payload.workspaceIndexId ?? workspaceIndexId;

    if (responseWorkspaceIndexId) {
      setWorkspaceIndexIdByMessageId((currentMessageScopes) => ({
        ...currentMessageScopes,
        [payload.messages.assistant.id]: responseWorkspaceIndexId,
      }));
    }

    if (areaId) {
      router.replace(
        createVaultChatHref({
          areaId,
          chatSessionId: payload.chatSessionId,
          vaultId,
          vaultSlug,
        }),
      );
      router.refresh();
      return;
    }

    if (workspaceIndexId) {
      router.replace(
        createVaultChatHref({
          chatSessionId: payload.chatSessionId,
          vaultId,
          vaultSlug,
          workspaceIndexId,
        }),
      );
      router.refresh();
      return;
    }

    if (vaultId) {
      router.replace(
        conversationRoute === 'ask'
          ? createVaultAskHref({
              chatSessionId: payload.chatSessionId,
              vaultId,
              vaultSlug,
            })
          : createVaultChatHref({
              chatSessionId: payload.chatSessionId,
              scope: 'vault',
              vaultId,
              vaultSlug,
            }),
      );
    }
  }

  function appendAssistantToken(localAssistantMessageId: string, token: string) {
    setMessages((currentMessages) =>
      currentMessages.map((message) => {
        if (message.id !== localAssistantMessageId) {
          return message;
        }

        return {
          ...message,
          content:
            message.content === strings.pendingAssistantMessage
              ? token
              : `${message.content}${token}`,
        };
      }),
    );
  }

  async function handleJsonResponse(
    response: Response,
    localAssistantMessageId: string,
    localUserMessageId: string,
  ) {
    const payload = (await response.json()) as ChatApiResponse;

    if (!payload.ok) {
      throw new Error(payload.error.message);
    }

    applyCompletedResponse(payload, localAssistantMessageId, localUserMessageId);
  }

  async function handleStreamResponse(
    response: Response,
    localAssistantMessageId: string,
    localUserMessageId: string,
  ) {
    const reader = response.body?.getReader();

    if (!reader) {
      throw new Error(strings.fallbackError);
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let finished = false;

    async function handleEvent(parsedEvent: ParsedStreamEvent) {
      if (parsedEvent.event === 'session') {
        const payload = parseStreamPayload<ChatStreamSessionPayload>(parsedEvent.data);

        setCurrentChatSessionId(payload.chatSessionId);
        setMessages((currentMessages) =>
          replaceMessageById(currentMessages, localUserMessageId, payload.message),
        );
        return;
      }

      if (parsedEvent.event === 'sources') {
        const payload = parseStreamPayload<ChatStreamSourcesPayload>(parsedEvent.data);

        setSources(payload.sources);
        return;
      }

      if (parsedEvent.event === 'token') {
        const payload = parseStreamPayload<ChatStreamTokenPayload>(parsedEvent.data);

        appendAssistantToken(localAssistantMessageId, payload.token);
        return;
      }

      if (parsedEvent.event === 'done') {
        const payload = parseStreamPayload<ChatStreamDonePayload>(parsedEvent.data);

        finished = true;
        applyCompletedResponse(payload, localAssistantMessageId, localUserMessageId);
        return;
      }

      if (parsedEvent.event === 'error') {
        const payload = parseStreamPayload<ChatStreamErrorPayload>(parsedEvent.data);

        throw new Error(payload.message);
      }
    }

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      while (buffer.includes('\n\n')) {
        const separatorIndex = buffer.indexOf('\n\n');
        const block = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        const parsedEvent = parseStreamEvent(block);

        if (parsedEvent) {
          await handleEvent(parsedEvent);
        }
      }
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
      const parsedEvent = parseStreamEvent(buffer);

      if (parsedEvent) {
        await handleEvent(parsedEvent);
      }
    }

    if (!finished) {
      throw new Error(strings.fallbackError);
    }
  }

  async function submitQuestion() {
    const question = inputValue.trim();
    const endpoint =
      vaultId && areaId
        ? `/api/vault/${vaultId}/chat`
        : workspaceIndexId
          ? `/api/workspace-indexes/${workspaceIndexId}/chat`
          : vaultId
            ? `/api/vault/${vaultId}/chat`
            : null;

    if (!endpoint || isDisabled || !question || isSubmitting) {
      return;
    }

    const localUserMessage = createLocalMessage('user', question);
    const localAssistantMessage = createLocalMessage('assistant', strings.pendingAssistantMessage);

    setInputValue('');
    setIsSubmitting(true);
    setSources([]);
    setStreamingAssistantMessageId(localAssistantMessage.id);
    setMessages((currentMessages) => [...currentMessages, localUserMessage, localAssistantMessage]);

    try {
      const response = await fetch(endpoint, {
        body: JSON.stringify({
          ...(areaId ? { areaId } : {}),
          ...(currentChatSessionId ? { chatSessionId: currentChatSessionId } : {}),
          message: question,
          stream: true,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
      const contentType = response.headers.get('Content-Type') ?? '';

      if (contentType.includes('text/event-stream')) {
        await handleStreamResponse(response, localAssistantMessage.id, localUserMessage.id);
        return;
      }

      await handleJsonResponse(response, localAssistantMessage.id, localUserMessage.id);
    } catch (submitError: unknown) {
      setMessages((currentMessages) =>
        currentMessages.filter((message) => message.id !== localAssistantMessage.id),
      );
      toast.error(submitError instanceof Error ? submitError.message : strings.fallbackError);
    } finally {
      setIsSubmitting(false);
      setStreamingAssistantMessageId(null);
    }
  }

  async function submitFeedback(
    messageId: string,
    signal: ChatFeedbackSignal,
    targetWorkspaceIndexId: string,
  ) {
    if (feedbackByMessageId[messageId] === 'saving') {
      return;
    }

    setFeedbackByMessageId((currentFeedback) => ({
      ...currentFeedback,
      [messageId]: 'saving',
    }));

    try {
      const response = await fetch(
        `/api/workspace-indexes/${targetWorkspaceIndexId}/chat/feedback`,
        {
          body: JSON.stringify({
            chatMessageId: messageId,
            signal,
            ...(areaId ? { workspaceAreaId: areaId } : {}),
          }),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
        },
      );
      const payload = (await response.json()) as FeedbackApiResponse;

      if (!payload.ok) {
        throw new Error(payload.error.message);
      }

      setFeedbackByMessageId((currentFeedback) => ({
        ...currentFeedback,
        [messageId]: 'saved',
      }));

      toast.success(strings.feedback.saved);
    } catch (feedbackError: unknown) {
      setFeedbackByMessageId((currentFeedback) => {
        const nextFeedback = { ...currentFeedback };

        delete nextFeedback[messageId];

        return nextFeedback;
      });
      toast.error(feedbackError instanceof Error ? feedbackError.message : strings.fallbackError);
    }
  }

  const chatInput = (
    <div className="grid gap-2">
      <ChatInput
        isDisabled={isDisabled}
        isSubmitting={isSubmitting}
        onChange={setInputValue}
        onSubmit={() => {
          void submitQuestion();
        }}
        strings={strings.input}
        value={inputValue}
      />
    </div>
  );

  return (
    <section className="mx-auto flex min-h-[420px] w-full max-w-7xl flex-col lg:min-h-[calc(100vh-4rem)]">
      {messages.length > 0 ? (
        <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col">
          <div className="flex-1 px-1 py-4 pb-40 lg:pb-44">
            {disabledReason ? (
              <div className="mb-4 rounded-md border border-[var(--warning-border)] bg-[var(--warning-muted)] px-3 py-2 text-sm leading-6 text-[var(--warning-foreground)]">
                {disabledReason}
              </div>
            ) : null}
            <div className="grid gap-5">
              {messages.map((message) => {
                const isPersistedAssistant =
                  message.role === 'assistant' && !message.id.startsWith('local-');
                const messageWorkspaceIndexId =
                  workspaceIndexId ??
                  workspaceIndexIdByMessageId[message.id] ??
                  initialMessageWorkspaceIndexId;

                return (
                  <ChatMessage
                    assistantLabel="VaultMind"
                    feedbackState={feedbackByMessageId[message.id] ?? 'idle'}
                    isLoading={streamingAssistantMessageId === message.id}
                    key={message.id}
                    message={message}
                    userLabel={strings.userLabel}
                    {...(isPersistedAssistant && messageWorkspaceIndexId
                      ? {
                          feedbackStrings: strings.feedback,
                          onFeedbackSubmit: (messageId: string, signal: ChatFeedbackSignal) => {
                            void submitFeedback(messageId, signal, messageWorkspaceIndexId);
                          },
                        }
                      : {})}
                  />
                );
              })}
              <SourcePanel sources={sources} strings={strings.sources} />
            </div>
          </div>

          <div className="sticky bottom-0 z-10 -mx-4 bg-[var(--background)] px-4 pb-4 pt-3">
            <div className="mx-auto w-full max-w-4xl">{chatInput}</div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col pb-24">
          {emptyStateVariant === 'input-only' ? (
            <div className="mx-auto flex min-h-[calc(100vh-12rem)] w-full max-w-3xl flex-col justify-center gap-4">
              {disabledReason ? (
                <div className="flex flex-col gap-3 rounded-md border border-[var(--warning-border)] bg-[var(--warning-muted)] px-3 py-2 text-sm leading-6 text-[var(--warning-foreground)] sm:flex-row sm:items-center sm:justify-between">
                  <span>{disabledReason}</span>
                  {disabledAction}
                </div>
              ) : null}
              {chatInput}
            </div>
          ) : (
            <KnowledgeWorkspaceOverview
              chatInput={chatInput}
              disabledReason={disabledReason}
              vaultId={vaultId}
              vaultSlug={vaultSlug ?? null}
              workspaceIndex={workspaceIndex}
              workspaceIndexes={workspaceIndexes}
              strings={strings.workspace}
            />
          )}
        </div>
      )}
    </section>
  );
}
