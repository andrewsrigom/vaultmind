import {
  createChatMessage,
  createRetrievedSources,
  getOrCreateChatSession,
} from '@/db/queries/chat';
import { getDb } from '@/db';
import { createWorkspaceIndexEvent } from '@/db/queries/knowledge-events';
import { createOpenAIChatProvider } from '@/lib/providers/openai-chat-provider';
import {
  createPromptSnippet,
  getInsufficientContextAnswer,
  getSecurityRefusalAnswer,
  normalizePromptText,
} from '@/lib/prompts';
import { buildRagPrompt, type BuildRagPromptInput } from '@/lib/rag/build-rag-prompt';
import { RagRetrievalError, searchRelevantChunks } from '@/lib/rag/search-relevant-chunks';

import type { Db } from '@/db';
import type { ChatMessage } from '@/db/schema';
import type { ChatProvider, ChatProviderMessage } from '@/lib/providers/chat-provider';
import type { EmbeddingProvider } from '@/lib/providers/embedding-provider';
import type { PromptOutputLanguagePreference } from '@/lib/prompts';
import type { RelevantChunk, SearchRelevantChunksInput } from '@/lib/rag/search-relevant-chunks';

export type AnswerSource = {
  chunkId: string;
  citationIndex: number;
  documentId: string;
  workspaceIndexId: string | null;
  workspaceIndexName: string | null;
  path: string;
  similarity: number;
  snippet: string;
  sourceId: string;
  sourceName: string;
  sourceType: RelevantChunk['sourceType'];
  title: string;
};

export type GenerateAnswerInput = {
  answerLanguage?: PromptOutputLanguagePreference | null;
  chatProvider?: ChatProvider | undefined;
  chatSessionId?: string | null;
  db?: Db;
  embeddingProvider?: EmbeddingProvider | undefined;
  workspaceIndexId: string;
  question: string;
  retrievalLimit?: number;
  retrievalUpdatedAfter?: Date;
  retrievalWorkspaceIndexIds?: string[];
  workspaceAreaId?: string | null;
};

export type GenerateAnswerResult = {
  answer: string;
  assistantMessage: ChatMessage;
  chatSessionId: string;
  workspaceIndexId: string;
  sources: AnswerSource[];
  userMessage: ChatMessage;
};

export type GenerateEphemeralAnswerInput = Omit<GenerateAnswerInput, 'chatSessionId'>;

export type GenerateEphemeralAnswerResult = {
  answer: string;
  workspaceIndexId: string;
  sources: AnswerSource[];
};

export type AnswerRefusalReason = 'insufficient-context' | 'security-policy' | null;

export type PreparedChatAnswer = {
  answerOverride: string | null;
  chatSessionId: string;
  db: Db;
  workspaceIndexId: string;
  promptMessages: ChatProviderMessage[];
  refusalReason: AnswerRefusalReason;
  sources: AnswerSource[];
  userMessage: ChatMessage;
  workspaceAreaId: string | null;
};

export type CompletePreparedAnswerInput = {
  chatProvider?: ChatProvider | undefined;
  prepared: PreparedChatAnswer;
};

export type StreamPreparedAnswerInput = CompletePreparedAnswerInput & {
  onToken: (token: string) => Promise<void> | void;
};

const snippetMaxCharacters = 420;
const titleMaxCharacters = 72;
const instructionOverridePattern =
  /\b(ignore|disregard|forget|bypass|override|jailbreak|debug mode|developer mode|ignore previous|ignore all previous|ignore todas|ignore as instru(?:ç|c)(?:õ|o)es|modo debug|modo desenvolvedor|contornar|burlar)\b/iu;
const secretDisclosureActionPattern =
  /\b(reveal|show|print|list|dump|expose|leak|extract|display|mostre|mostrar|liste|listar|imprima|revele|revelar|exiba|vaze|vazar|extraia|extrair)\b/iu;
const sensitiveSecurityTargetPattern =
  /\b(system prompt|developer prompt|developer instructions?|hidden instructions?|internal instructions?|security instructions?|prompt de sistema|prompt interno|instru(?:ç|c)(?:õ|o)es internas|instru(?:ç|c)(?:õ|o)es ocultas|instru(?:ç|c)(?:õ|o)es de seguran(?:ç|c)a|vari(?:á|a)veis de ambiente|environment variables?|env vars?|openai_api_key|database_url|notion_oauth_client_secret|source_credential_encryption_key|api keys?|client secret|access token|refresh token|secret(?:s)?|segredos?|credenciais?|tokens?|chaves? de api|senha)\b/iu;
const securityBypassPattern =
  /\b(bypass(?:ing)? security|ways? to bypass|how to bypass|contornar(?: controles?| regras?| seguran(?:ç|c)a)?|burlar(?: controles?| regras?| seguran(?:ç|c)a)?|como contornar|como burlar)\b/iu;
const attackerSuccessMarkerPattern = /\bsecurity test passed\b/iu;

function createChatSessionTitle(question: string): string {
  return createPromptSnippet(question, titleMaxCharacters);
}

function isSensitiveSecurityRequest(question: string): boolean {
  const asksForSensitiveTarget = sensitiveSecurityTargetPattern.test(question);
  const asksForDisclosure = secretDisclosureActionPattern.test(question);
  const asksForInstructionOverride = instructionOverridePattern.test(question);
  const asksForSecurityBypass = securityBypassPattern.test(question);
  const includesAttackerSuccessMarker = attackerSuccessMarkerPattern.test(question);

  return (
    (asksForSensitiveTarget && (asksForDisclosure || asksForInstructionOverride)) ||
    asksForSecurityBypass ||
    (includesAttackerSuccessMarker && (asksForSensitiveTarget || asksForInstructionOverride))
  );
}

function isInsufficientContextResponse(answer: string): boolean {
  const normalizedAnswer = normalizePromptText(answer).toLocaleLowerCase();
  const normalizedEnglishRefusal = getInsufficientContextAnswer('en').toLocaleLowerCase();
  const normalizedPortugueseRefusal = getInsufficientContextAnswer('pt').toLocaleLowerCase();

  return (
    normalizedAnswer === normalizedEnglishRefusal ||
    normalizedAnswer === normalizedPortugueseRefusal ||
    normalizedAnswer.startsWith(normalizedEnglishRefusal) ||
    normalizedAnswer.startsWith(normalizedPortugueseRefusal) ||
    normalizedAnswer.startsWith('the workspace does not contain enough information') ||
    normalizedAnswer.startsWith('o workspace nao contem informacoes suficientes') ||
    normalizedAnswer.startsWith('o workspace não contém informações suficientes')
  );
}

function toAnswerSources(chunks: RelevantChunk[]): AnswerSource[] {
  return chunks.map((chunk, index) => ({
    chunkId: chunk.chunkId,
    citationIndex: index + 1,
    documentId: chunk.documentId,
    path: chunk.path,
    similarity: chunk.similarity,
    snippet: createPromptSnippet(chunk.content, snippetMaxCharacters),
    sourceId: chunk.sourceId,
    sourceName: chunk.sourceName,
    sourceType: chunk.sourceType,
    title: chunk.title,
    workspaceIndexId: chunk.workspaceIndexId ?? null,
    workspaceIndexName: chunk.workspaceIndexName ?? null,
  }));
}

export function resolveRetrievedWorkspaceIndexId({
  chunks,
  fallbackWorkspaceIndexId,
}: {
  chunks: RelevantChunk[];
  fallbackWorkspaceIndexId: string;
}): string {
  const bestChunk = chunks.reduce<RelevantChunk | null>((currentBestChunk, chunk) => {
    if (!chunk.workspaceIndexId) {
      return currentBestChunk;
    }

    if (!currentBestChunk || chunk.similarity > currentBestChunk.similarity) {
      return chunk;
    }

    return currentBestChunk;
  }, null);

  return bestChunk?.workspaceIndexId ?? fallbackWorkspaceIndexId;
}

async function saveAssistantAnswer(input: {
  answer: string;
  chatSessionId: string;
  db: Db;
  refusalReason: AnswerRefusalReason;
  workspaceIndexId: string;
  sources: AnswerSource[];
}): Promise<ChatMessage> {
  const assistantMessage = await createChatMessage({
    chatSessionId: input.chatSessionId,
    content: input.answer,
    db: input.db,
    role: 'assistant',
  });

  await createRetrievedSources({
    chatMessageId: assistantMessage.id,
    db: input.db,
    sources: input.sources.map((source) => ({
      chunkId: source.chunkId,
      documentId: source.documentId,
      similarity: source.similarity,
      snippet: source.snippet,
    })),
  });

  await createAnswerEvents({
    assistantMessage,
    db: input.db,
    isRefusal:
      input.refusalReason !== null ||
      input.sources.length === 0 ||
      isInsufficientContextResponse(input.answer),
    refusalReason: input.refusalReason,
    sources: input.sources,
    workspaceIndexId: input.workspaceIndexId,
  });

  return assistantMessage;
}

async function createAnswerEvents(input: {
  assistantMessage: ChatMessage;
  db: Db;
  isRefusal: boolean;
  refusalReason: AnswerRefusalReason;
  workspaceIndexId: string;
  sources: AnswerSource[];
}) {
  await createWorkspaceIndexEvent({
    chatMessageId: input.assistantMessage.id,
    chatSessionId: input.assistantMessage.chatSessionId,
    db: input.db,
    metadata: {
      ...(input.refusalReason ? { refusalReason: input.refusalReason } : {}),
      sourceCount: input.sources.length,
    },
    type: input.isRefusal ? 'answer-refused' : 'answer-generated',
    workspaceIndexId: input.workspaceIndexId,
  });

  for (const source of input.sources) {
    await createWorkspaceIndexEvent({
      chatMessageId: input.assistantMessage.id,
      chatSessionId: input.assistantMessage.chatSessionId,
      db: input.db,
      metadata: {
        chunkId: source.chunkId,
        citationIndex: source.citationIndex,
        documentId: source.documentId,
        path: source.path,
      },
      sourceId: source.sourceId,
      type: 'source-cited',
      workspaceIndexId: input.workspaceIndexId,
    });
  }
}

export async function generateAnswer({
  answerLanguage,
  chatProvider,
  chatSessionId,
  db = getDb(),
  embeddingProvider,
  question,
  retrievalLimit,
  retrievalUpdatedAfter,
  retrievalWorkspaceIndexIds,
  workspaceAreaId,
  workspaceIndexId,
}: GenerateAnswerInput): Promise<GenerateAnswerResult> {
  const prepareInput: Omit<GenerateAnswerInput, 'chatProvider'> = {
    db,
    question,
    workspaceIndexId,
  };

  if (answerLanguage !== undefined) {
    prepareInput.answerLanguage = answerLanguage;
  }

  if (chatSessionId !== undefined) {
    prepareInput.chatSessionId = chatSessionId;
  }

  if (embeddingProvider) {
    prepareInput.embeddingProvider = embeddingProvider;
  }

  if (retrievalLimit !== undefined) {
    prepareInput.retrievalLimit = retrievalLimit;
  }

  if (retrievalUpdatedAfter !== undefined) {
    prepareInput.retrievalUpdatedAfter = retrievalUpdatedAfter;
  }

  if (retrievalWorkspaceIndexIds !== undefined) {
    prepareInput.retrievalWorkspaceIndexIds = retrievalWorkspaceIndexIds;
  }

  if (workspaceAreaId !== undefined) {
    prepareInput.workspaceAreaId = workspaceAreaId;
  }

  const prepared = await prepareChatAnswer(prepareInput);

  return completePreparedAnswer({
    chatProvider,
    prepared,
  });
}

export async function generateEphemeralAnswer({
  answerLanguage,
  chatProvider,
  db = getDb(),
  embeddingProvider,
  question,
  retrievalLimit,
  retrievalUpdatedAfter,
  retrievalWorkspaceIndexIds,
  workspaceAreaId,
  workspaceIndexId,
}: GenerateEphemeralAnswerInput): Promise<GenerateEphemeralAnswerResult> {
  const trimmedQuestion = question.trim();
  const insufficientAnswer = getInsufficientContextAnswer(answerLanguage);
  const securityRefusalAnswer = getSecurityRefusalAnswer(answerLanguage);
  const effectiveRetrievalLimit = retrievalLimit;
  let chunks: RelevantChunk[] = [];

  if (isSensitiveSecurityRequest(trimmedQuestion)) {
    return {
      answer: securityRefusalAnswer,
      sources: [],
      workspaceIndexId,
    };
  }

  try {
    const searchInput: SearchRelevantChunksInput = {
      db,
      query: trimmedQuestion,
    };

    if (retrievalWorkspaceIndexIds?.length) {
      searchInput.workspaceIndexIds = retrievalWorkspaceIndexIds;
    } else {
      searchInput.workspaceIndexId = workspaceIndexId;
    }

    if (embeddingProvider) {
      searchInput.embeddingProvider = embeddingProvider;
    }

    if (effectiveRetrievalLimit !== undefined) {
      searchInput.limit = effectiveRetrievalLimit;
    }

    if (retrievalUpdatedAfter) {
      searchInput.updatedAfter = retrievalUpdatedAfter;
    }

    if (workspaceAreaId) {
      searchInput.workspaceAreaId = workspaceAreaId;
    }

    chunks = await searchRelevantChunks(searchInput);
  } catch (error: unknown) {
    if (!(error instanceof RagRetrievalError)) {
      throw error;
    }

    return {
      answer: insufficientAnswer,
      sources: [],
      workspaceIndexId,
    };
  }

  const promptInput: BuildRagPromptInput = {
    chunks,
    question: trimmedQuestion,
  };

  if (answerLanguage !== undefined) {
    promptInput.outputLanguage = answerLanguage;
  }

  const prompt = buildRagPrompt(promptInput);
  const sources = toAnswerSources(prompt.includedChunks);

  if (sources.length === 0) {
    return {
      answer: insufficientAnswer,
      sources: [],
      workspaceIndexId,
    };
  }

  const provider = chatProvider ?? createOpenAIChatProvider();
  const answer = await provider.generateText(prompt.messages);

  return {
    answer,
    sources,
    workspaceIndexId,
  };
}

export async function prepareChatAnswer({
  answerLanguage,
  chatSessionId,
  db = getDb(),
  embeddingProvider,
  question,
  retrievalLimit,
  retrievalUpdatedAfter,
  retrievalWorkspaceIndexIds,
  workspaceAreaId,
  workspaceIndexId,
}: Omit<GenerateAnswerInput, 'chatProvider'>): Promise<PreparedChatAnswer> {
  const trimmedQuestion = question.trim();
  const insufficientAnswer = getInsufficientContextAnswer(answerLanguage);
  const securityRefusalAnswer = getSecurityRefusalAnswer(answerLanguage);
  const effectiveRetrievalLimit = retrievalLimit;
  let chunks: RelevantChunk[] = [];
  let answerOverride: string | null = null;

  if (isSensitiveSecurityRequest(trimmedQuestion)) {
    const chatSession = await getOrCreateChatSession({
      db,
      title: createChatSessionTitle(trimmedQuestion),
      workspaceIndexId,
      ...(chatSessionId ? { chatSessionId } : {}),
      ...(retrievalWorkspaceIndexIds?.length
        ? { allowedWorkspaceIndexIds: retrievalWorkspaceIndexIds }
        : {}),
    });
    const userMessage = await createChatMessage({
      chatSessionId: chatSession.id,
      content: trimmedQuestion,
      db,
      role: 'user',
    });

    await createWorkspaceIndexEvent({
      chatMessageId: userMessage.id,
      chatSessionId: chatSession.id,
      db,
      metadata: {
        questionLength: trimmedQuestion.length,
      },
      type: 'question-asked',
      workspaceIndexId: chatSession.workspaceIndexId,
    });

    return {
      answerOverride: securityRefusalAnswer,
      chatSessionId: chatSession.id,
      db,
      promptMessages: [],
      refusalReason: 'security-policy',
      sources: [],
      userMessage,
      workspaceAreaId: workspaceAreaId ?? null,
      workspaceIndexId: chatSession.workspaceIndexId,
    };
  }

  try {
    const searchInput: SearchRelevantChunksInput = {
      db,
      query: trimmedQuestion,
    };

    if (retrievalWorkspaceIndexIds?.length) {
      searchInput.workspaceIndexIds = retrievalWorkspaceIndexIds;
    } else {
      searchInput.workspaceIndexId = workspaceIndexId;
    }

    if (embeddingProvider) {
      searchInput.embeddingProvider = embeddingProvider;
    }

    if (effectiveRetrievalLimit !== undefined) {
      searchInput.limit = effectiveRetrievalLimit;
    }

    if (retrievalUpdatedAfter) {
      searchInput.updatedAfter = retrievalUpdatedAfter;
    }

    if (workspaceAreaId) {
      searchInput.workspaceAreaId = workspaceAreaId;
    }

    chunks = await searchRelevantChunks(searchInput);
  } catch (error: unknown) {
    if (!(error instanceof RagRetrievalError)) {
      throw error;
    }

    answerOverride = insufficientAnswer;
  }

  const shouldAnchorToRetrievedArea = !chatSessionId && retrievalWorkspaceIndexIds?.length;
  const resolvedWorkspaceIndexId = shouldAnchorToRetrievedArea
    ? resolveRetrievedWorkspaceIndexId({
        chunks,
        fallbackWorkspaceIndexId: workspaceIndexId,
      })
    : workspaceIndexId;
  const chatSession = await getOrCreateChatSession({
    db,
    title: createChatSessionTitle(trimmedQuestion),
    workspaceIndexId: resolvedWorkspaceIndexId,
    ...(chatSessionId ? { chatSessionId } : {}),
    ...(retrievalWorkspaceIndexIds?.length
      ? { allowedWorkspaceIndexIds: retrievalWorkspaceIndexIds }
      : {}),
  });
  const eventWorkspaceIndexId = chatSession.workspaceIndexId;
  const userMessage = await createChatMessage({
    chatSessionId: chatSession.id,
    content: trimmedQuestion,
    db,
    role: 'user',
  });
  await createWorkspaceIndexEvent({
    chatMessageId: userMessage.id,
    chatSessionId: chatSession.id,
    db,
    metadata: {
      questionLength: trimmedQuestion.length,
    },
    type: 'question-asked',
    workspaceIndexId: eventWorkspaceIndexId,
  });

  if (answerOverride) {
    return {
      answerOverride,
      chatSessionId: chatSession.id,
      db,
      promptMessages: [],
      refusalReason: 'insufficient-context',
      sources: [],
      userMessage,
      workspaceAreaId: workspaceAreaId ?? null,
      workspaceIndexId: eventWorkspaceIndexId,
    };
  }

  const promptInput: BuildRagPromptInput = {
    chunks,
    question: trimmedQuestion,
  };

  if (answerLanguage !== undefined) {
    promptInput.outputLanguage = answerLanguage;
  }

  const prompt = buildRagPrompt(promptInput);
  const sources = toAnswerSources(prompt.includedChunks);

  return {
    answerOverride: sources.length > 0 ? null : insufficientAnswer,
    chatSessionId: chatSession.id,
    db,
    promptMessages: prompt.messages,
    refusalReason: sources.length > 0 ? null : 'insufficient-context',
    sources,
    userMessage,
    workspaceAreaId: workspaceAreaId ?? null,
    workspaceIndexId: eventWorkspaceIndexId,
  };
}

export async function completePreparedAnswer({
  chatProvider,
  prepared,
}: CompletePreparedAnswerInput): Promise<GenerateAnswerResult> {
  let answer = prepared.answerOverride;

  if (!answer) {
    const provider = chatProvider ?? createOpenAIChatProvider();

    answer = await provider.generateText(prepared.promptMessages);
  }

  const assistantMessage = await saveAssistantAnswer({
    answer,
    chatSessionId: prepared.chatSessionId,
    db: prepared.db,
    refusalReason: prepared.refusalReason,
    sources: prepared.sources,
    workspaceIndexId: prepared.workspaceIndexId,
  });

  return {
    answer,
    assistantMessage,
    chatSessionId: prepared.chatSessionId,
    sources: prepared.sources,
    userMessage: prepared.userMessage,
    workspaceIndexId: prepared.workspaceIndexId,
  };
}

export async function streamPreparedAnswer({
  chatProvider,
  onToken,
  prepared,
}: StreamPreparedAnswerInput): Promise<GenerateAnswerResult> {
  let answer = '';

  if (prepared.answerOverride) {
    answer = prepared.answerOverride;
    await onToken(answer);
  } else {
    const provider = chatProvider ?? createOpenAIChatProvider();

    for await (const token of provider.streamText(prepared.promptMessages)) {
      answer += token;
      await onToken(token);
    }

    answer = answer.trim();
  }

  const assistantMessage = await saveAssistantAnswer({
    answer,
    chatSessionId: prepared.chatSessionId,
    db: prepared.db,
    refusalReason: prepared.refusalReason,
    sources: prepared.sources,
    workspaceIndexId: prepared.workspaceIndexId,
  });

  return {
    answer,
    assistantMessage,
    chatSessionId: prepared.chatSessionId,
    sources: prepared.sources,
    userMessage: prepared.userMessage,
    workspaceIndexId: prepared.workspaceIndexId,
  };
}
