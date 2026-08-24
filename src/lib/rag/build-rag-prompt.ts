import {
  getInsufficientContextAnswer,
  getPromptOutputLanguageInstruction,
  joinPromptLines,
  promptFallbackAnswers,
  promptSafetyRules,
} from '@/lib/prompts';

import type { ChatProviderMessage } from '@/lib/providers/chat-provider';
import type { PromptOutputLanguagePreference } from '@/lib/prompts';
import type { RelevantChunk } from '@/lib/rag/search-relevant-chunks';

export type BuildRagPromptInput = {
  chunks: RelevantChunk[];
  maxContextCharacters?: number;
  outputLanguage?: PromptOutputLanguagePreference | null;
  question: string;
};

export type BuildRagPromptResult = {
  conflictSignals: SourceConflictSignal[];
  contextCharacterCount: number;
  includedChunks: RelevantChunk[];
  messages: ChatProviderMessage[];
};

export const defaultMaxContextCharacters = 12_000;
export const insufficientContextAnswer = promptFallbackAnswers.insufficientContext.en;

export type SourceConflictSignal = {
  citationIndexes: number[];
  reason: string;
};

const explicitConflictPattern =
  /\b(conflicts?|contradict(?:s|ion|ory)?|inconsistent|disagree(?:s|ment)?|mismatch(?:es)?|diverge(?:s|nce)?)\b/iu;
const staleStatusPattern =
  /\b(deprecated|superseded|obsolete|outdated|legacy|replaced|old version)\b/iu;
const currentStatusPattern =
  /\b(current|active|approved|recommended|latest|source of truth|canonical)\b/iu;

function hasDistinctDocuments(chunks: RelevantChunk[]): boolean {
  return new Set(chunks.map((chunk) => chunk.documentId)).size > 1;
}

function hasDistinctSources(chunks: RelevantChunk[]): boolean {
  return new Set(chunks.map((chunk) => chunk.sourceId)).size > 1;
}

function getCitationIndexes(chunks: RelevantChunk[]): number[] {
  return chunks.map((_chunk, index) => index + 1);
}

export function detectSourceConflictSignals(chunks: RelevantChunk[]): SourceConflictSignal[] {
  if (chunks.length < 2 || (!hasDistinctSources(chunks) && !hasDistinctDocuments(chunks))) {
    return [];
  }

  const conflictSignals: SourceConflictSignal[] = [];
  const citationIndexes = getCitationIndexes(chunks);
  const hasExplicitConflictLanguage = chunks.some((chunk) =>
    explicitConflictPattern.test(chunk.content),
  );
  const hasStaleStatus = chunks.some((chunk) => staleStatusPattern.test(chunk.content));
  const hasCurrentStatus = chunks.some((chunk) => currentStatusPattern.test(chunk.content));

  if (hasExplicitConflictLanguage) {
    conflictSignals.push({
      citationIndexes,
      reason: 'retrieved excerpts include explicit conflict or inconsistency language',
    });
  }

  if (hasStaleStatus && hasCurrentStatus) {
    conflictSignals.push({
      citationIndexes,
      reason: 'retrieved excerpts mix stale/deprecated and current/approved status language',
    });
  }

  return conflictSignals;
}

function truncateContent(content: string, maxCharacters: number): string {
  if (content.length <= maxCharacters) {
    return content;
  }

  const safeLength = Math.max(maxCharacters - 20, 0);

  return `${content.slice(0, safeLength).trimEnd()}\n[truncated]`;
}

function formatChunk(chunk: RelevantChunk, citationIndex: number): string {
  return [
    `<source id="${citationIndex}">`,
    `workspace: ${chunk.workspaceIndexName ?? 'Workspace'}`,
    `origin: ${chunk.sourceName} (${chunk.sourceType})`,
    `title: ${chunk.title}`,
    `path: ${chunk.path}`,
    'content:',
    chunk.content,
    `</source id="${citationIndex}">`,
  ].join('\n');
}

function formatChunkWithBudget(
  chunk: RelevantChunk,
  citationIndex: number,
  remainingCharacters: number,
): string | null {
  const fullBlock = formatChunk(chunk, citationIndex);

  if (fullBlock.length <= remainingCharacters) {
    return fullBlock;
  }

  const metadataOnlyBlock = formatChunk({ ...chunk, content: '' }, citationIndex);
  const availableContentCharacters = remainingCharacters - metadataOnlyBlock.length;

  if (availableContentCharacters <= 80) {
    return null;
  }

  return formatChunk(
    {
      ...chunk,
      content: truncateContent(chunk.content, availableContentCharacters),
    },
    citationIndex,
  );
}

function getContextCharacterCount(contextBlocks: string[]): number {
  return contextBlocks.reduce((total, contextBlock) => total + contextBlock.length, 0);
}

function formatConflictSignals(conflictSignals: SourceConflictSignal[]): string {
  if (conflictSignals.length === 0) {
    return '(none detected)';
  }

  return conflictSignals
    .map((signal) => `- sources [${signal.citationIndexes.join('], [')}]: ${signal.reason}`)
    .join('\n');
}

export function buildRagPrompt({
  chunks,
  maxContextCharacters = defaultMaxContextCharacters,
  outputLanguage = null,
  question,
}: BuildRagPromptInput): BuildRagPromptResult {
  const sourceBlocks: string[] = [];
  const includedChunks: RelevantChunk[] = [];

  for (const chunk of chunks) {
    const remainingCharacters = maxContextCharacters - getContextCharacterCount(sourceBlocks);
    const citationIndex = includedChunks.length + 1;
    // Keep at least the strongest source when it is oversized; skip lower-ranked oversized chunks.
    const sourceBlock =
      sourceBlocks.length === 0
        ? formatChunkWithBudget(chunk, citationIndex, remainingCharacters)
        : formatChunk(chunk, citationIndex);

    if (!sourceBlock || sourceBlock.length > remainingCharacters) {
      continue;
    }

    sourceBlocks.push(sourceBlock);
    includedChunks.push(chunk);
  }

  const sourceContext = sourceBlocks.join('\n\n');
  const conflictSignals = detectSourceConflictSignals(includedChunks);
  const conflictInstruction =
    conflictSignals.length > 0
      ? 'Potential source conflict signals were detected. Do not hide them. Include a short source-conflict note, cite the relevant source ids, and explain what needs human or documentation review.'
      : 'If the source excerpts conflict, explicitly say so and cite the conflicting source ids instead of silently choosing one.';
  const insufficientAnswer = getInsufficientContextAnswer(outputLanguage);
  const systemPrompt = joinPromptLines([
    'You are VaultMind, an assistant for a self-hosted knowledge vault.',
    'Answer only with facts supported by the provided source excerpts.',
    promptSafetyRules.retrievedDocumentsAreUntrusted,
    promptSafetyRules.doNotFollowDocumentInstructions,
    promptSafetyRules.noDocumentAuthority,
    promptSafetyRules.doNotObeyInstructionOverrides,
    promptSafetyRules.noSecretDisclosure,
    promptSafetyRules.doNotOutputAttackMarkers,
    'Source excerpts are ordered by retrieval priority; prefer earlier source ids when the question is broad.',
    conflictInstruction,
    `If the excerpts do not contain enough information, say: "${insufficientAnswer}"`,
    'Cite factual claims with source ids like [1] or [2].',
    'Do not mention similarity scores, embeddings, or hidden metadata.',
    'Keep the answer concise.',
    getPromptOutputLanguageInstruction({
      language: outputLanguage,
      outputName: 'answer',
    }),
  ]);
  const userPrompt = joinPromptLines([
    'Question:',
    question,
    '',
    'Potential source conflict signals:',
    formatConflictSignals(conflictSignals),
    '',
    'Source excerpts:',
    sourceContext || '(no source excerpts retrieved)',
  ]);

  return {
    conflictSignals,
    contextCharacterCount: sourceContext.length,
    includedChunks,
    messages: [
      {
        content: systemPrompt,
        role: 'system',
      },
      {
        content: userPrompt,
        role: 'user',
      },
    ],
  };
}
