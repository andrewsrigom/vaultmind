import { z } from 'zod';

import {
  completeAreaDiscoveryRun,
  createAreaSuggestion,
  deleteAreaDiscoveryRunResults,
  failAreaDiscoveryRun,
  getAreaDiscoveryRunDetail,
  listAreaDiscoveryDocuments,
  startAreaDiscoveryRun,
} from '@/db/queries/area-discovery';
import { getDb } from '@/db';
import { extractJsonObjectText } from '@/lib/model-json';
import { ChatProviderError } from '@/lib/providers/chat-provider';
import {
  createPromptMessages,
  formatPromptDocument,
  promptOutputContracts,
  promptSafetyRules,
} from '@/lib/prompts';
import { createOpenAIChatProvider } from '@/lib/providers/openai-chat-provider';

import type { AreaDiscoveryRunDetail, AreaDiscoveryDocument } from '@/db/queries/area-discovery';
import type { Db } from '@/db';
import type { ChatProvider, ChatProviderMessage } from '@/lib/providers/chat-provider';

export type RunAreaDiscoveryInput = {
  chatProvider?: ChatProvider;
  db?: Db;
  workspaceIndexId: string;
  runId: string;
};

export type AreaDiscoveryErrorCode =
  | 'area-discovery-invalid-output'
  | 'area-discovery-no-documents'
  | 'area-discovery-run-not-found'
  | 'chat-config-error'
  | 'chat-provider-error'
  | 'unexpected-error';

export class AreaDiscoveryError extends Error {
  code: AreaDiscoveryErrorCode;
  status: number;

  constructor(code: AreaDiscoveryErrorCode, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const maxAreaDocuments = 24;
const maxAreas = 12;
const maxDocumentCharacters = 1800;
const maxDocumentsPerArea = 25;

const discoveredAreaDocumentSchema = z
  .object({
    confidence: z.number().min(0).max(1),
    path: z.string().trim().min(1).max(500),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

const discoveredAreaSchema = z
  .object({
    confidence: z.number().min(0).max(1),
    description: z.string().trim().min(1).max(500),
    documents: z.array(discoveredAreaDocumentSchema).min(1).max(maxDocumentsPerArea),
    name: z.string().trim().min(1).max(120),
    reason: z.string().trim().min(1).max(800),
  })
  .strict();

const areaDiscoveryOutputSchema = z
  .object({
    areas: z.array(discoveredAreaSchema).min(1).max(maxAreas),
    summary: z.string().trim().min(1).max(1200),
  })
  .strict();

export type ParsedAreaDiscoveryOutput = z.infer<typeof areaDiscoveryOutputSchema>;

function formatDocumentForPrompt(document: AreaDiscoveryDocument, index: number): string {
  return formatPromptDocument({
    content: document.content,
    fields: [
      {
        label: 'path',
        value: document.path,
      },
      {
        label: 'title',
        value: document.title,
      },
      {
        label: 'sourceType',
        value: document.sourceType,
      },
    ],
    index,
    maxContentCharacters: maxDocumentCharacters,
  });
}

export function buildAreaDiscoveryPrompt(
  documents: AreaDiscoveryDocument[],
): ChatProviderMessage[] {
  const documentContext = documents
    .slice(0, maxAreaDocuments)
    .map((document, index) => formatDocumentForPrompt(document, index))
    .join('\n\n---\n\n');

  return createPromptMessages({
    system: [
      'You are VaultMind Area Discovery.',
      promptSafetyRules.documentsAreUntrusted,
      promptSafetyRules.doNotFollowDocumentInstructions,
      promptOutputContracts.strictJson,
    ],
    user: [
      'Group these documents into semantic company knowledge areas.',
      'Areas should describe how employees would naturally look for knowledge, not only folder names.',
      'A document may appear in multiple areas when genuinely useful, but avoid duplicate weak assignments.',
      'Use names that are concise and business-readable, such as "People & HR", "IT & Security", "Finance", or "Support".',
      'Use confidence from 0 to 1. Explain why each area and document belongs together.',
      '',
      'Return this JSON shape:',
      '{"summary":"string","areas":[{"name":"string","description":"string","confidence":0.9,"reason":"string","documents":[{"path":"path from provided documents","confidence":0.9,"reason":"string"}]}]}',
      '',
      'Documents:',
      documentContext,
    ],
  });
}

export function parseAreaDiscoveryModelOutput(output: string): ParsedAreaDiscoveryOutput {
  let parsed: unknown;

  try {
    const jsonObject = extractJsonObjectText(output);

    if (!jsonObject) {
      throw new AreaDiscoveryError(
        'area-discovery-invalid-output',
        'Area discovery model output was not valid JSON.',
        502,
      );
    }

    parsed = JSON.parse(jsonObject);
  } catch (error: unknown) {
    if (error instanceof AreaDiscoveryError) {
      throw error;
    }

    throw new AreaDiscoveryError(
      'area-discovery-invalid-output',
      'Area discovery model output was not valid JSON.',
      502,
    );
  }

  const result = areaDiscoveryOutputSchema.safeParse(parsed);

  if (!result.success) {
    throw new AreaDiscoveryError(
      'area-discovery-invalid-output',
      'Area discovery model output did not match the expected schema.',
      502,
    );
  }

  return result.data;
}

function toDocumentByPath(documents: AreaDiscoveryDocument[]): Map<string, AreaDiscoveryDocument> {
  return new Map(documents.map((document) => [document.path, document]));
}

async function persistAreaSuggestions(input: {
  db: Db;
  documents: AreaDiscoveryDocument[];
  workspaceIndexId: string;
  output: ParsedAreaDiscoveryOutput;
  runId: string;
}) {
  const documentByPath = toDocumentByPath(input.documents);

  for (const [areaIndex, area] of input.output.areas.entries()) {
    const suggestionDocuments = area.documents.flatMap((document) => {
      const matchedDocument = documentByPath.get(document.path);

      if (!matchedDocument) {
        return [];
      }

      return [
        {
          confidence: document.confidence,
          documentId: matchedDocument.id,
          reason: document.reason,
        },
      ];
    });

    if (suggestionDocuments.length === 0) {
      continue;
    }

    await createAreaSuggestion({
      confidence: area.confidence,
      db: input.db,
      description: area.description,
      documents: suggestionDocuments,
      name: area.name,
      reason: area.reason,
      runId: input.runId,
      sortOrder: areaIndex,
      workspaceIndexId: input.workspaceIndexId,
    });
  }
}

function toAreaDiscoveryError(error: unknown): AreaDiscoveryError {
  if (error instanceof AreaDiscoveryError) {
    return error;
  }

  if (error instanceof ChatProviderError) {
    return new AreaDiscoveryError(error.code, error.message, 502);
  }

  return new AreaDiscoveryError(
    'unexpected-error',
    'Area discovery failed unexpectedly. Try again after confirming documents are synced.',
    500,
  );
}

export async function runAreaDiscovery({
  chatProvider,
  db = getDb(),
  runId,
  workspaceIndexId,
}: RunAreaDiscoveryInput): Promise<AreaDiscoveryRunDetail> {
  const run = await startAreaDiscoveryRun({ db, runId, workspaceIndexId });

  if (!run) {
    throw new AreaDiscoveryError(
      'area-discovery-run-not-found',
      'Area discovery run was not found.',
      404,
    );
  }

  try {
    await deleteAreaDiscoveryRunResults({ db, runId, workspaceIndexId });

    const documents = await listAreaDiscoveryDocuments({ db, workspaceIndexId });

    if (documents.length === 0) {
      throw new AreaDiscoveryError(
        'area-discovery-no-documents',
        'Sync documents before discovering areas.',
        400,
      );
    }

    const provider = chatProvider ?? createOpenAIChatProvider();
    const output = parseAreaDiscoveryModelOutput(
      await provider.generateText(buildAreaDiscoveryPrompt(documents)),
    );

    await persistAreaSuggestions({
      db,
      documents,
      output,
      runId,
      workspaceIndexId,
    });

    const completedRun = await completeAreaDiscoveryRun({
      db,
      model: provider.model,
      runId,
      summary: output.summary,
      workspaceIndexId,
    });

    if (!completedRun) {
      throw new AreaDiscoveryError(
        'area-discovery-run-not-found',
        'Area discovery run was not found.',
        404,
      );
    }

    const detail = await getAreaDiscoveryRunDetail({ db, runId, workspaceIndexId });

    if (!detail) {
      throw new AreaDiscoveryError(
        'area-discovery-run-not-found',
        'Area discovery run was not found.',
        404,
      );
    }

    return detail;
  } catch (error: unknown) {
    const discoveryError = toAreaDiscoveryError(error);

    await failAreaDiscoveryRun({
      db,
      error: discoveryError.message,
      errorCode: discoveryError.code,
      runId,
      workspaceIndexId,
    });

    throw discoveryError;
  }
}
