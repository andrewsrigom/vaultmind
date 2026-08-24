import OpenAI from 'openai';
import { z } from 'zod';

import { getOpenAIEnv } from '@/lib/env';
import { createAbortTimeout, sleep, withAbortTimeout } from '@/lib/async';
import { ChatProviderError } from '@/lib/providers/chat-provider';
import {
  isTransientOpenAIError,
  retryTransientOpenAIRequest,
} from '@/lib/providers/openai-request';

import type { OpenAIEnv } from '@/lib/env';
import type { ChatProvider, ChatProviderMessage } from '@/lib/providers/chat-provider';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

type OpenAIChatProviderOptions = {
  apiKey?: string;
  maxRetries?: number;
  model?: string;
  timeoutMs?: number;
};

const defaultTimeoutMs = 45_000;
const retryDelayMs = 750;

function readOpenAIEnv(): OpenAIEnv {
  try {
    return getOpenAIEnv();
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      throw new ChatProviderError(
        'chat-config-error',
        'Set OPENAI_API_KEY before asking chat questions.',
      );
    }

    throw error;
  }
}

function toOpenAIMessages(messages: readonly ChatProviderMessage[]): ChatCompletionMessageParam[] {
  return messages.map((message) => ({
    content: message.content,
    role: message.role,
  }));
}

export function createOpenAIChatProvider(options: OpenAIChatProviderOptions = {}): ChatProvider {
  const env = options.apiKey && options.model ? null : readOpenAIEnv();
  const apiKey = options.apiKey ?? env?.OPENAI_API_KEY;
  const maxRetries = options.maxRetries ?? 2;
  const model = options.model ?? env?.OPENAI_CHAT_MODEL ?? 'gpt-4.1-mini';
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;

  if (!apiKey) {
    throw new ChatProviderError(
      'chat-config-error',
      'Set OPENAI_API_KEY before asking chat questions.',
    );
  }

  const client = new OpenAI({ apiKey });

  return {
    async generateText(messages: readonly ChatProviderMessage[]): Promise<string> {
      try {
        const response = await retryTransientOpenAIRequest({
          maxRetries,
          operation: () =>
            withAbortTimeout(
              (signal) =>
                client.chat.completions.create(
                  {
                    messages: toOpenAIMessages(messages),
                    model,
                    stream: false,
                    temperature: 0.2,
                  },
                  { signal },
                ),
              timeoutMs,
            ),
          retryDelayMs,
        });
        const content = response.choices[0]?.message.content?.trim();

        if (!content) {
          throw new ChatProviderError(
            'chat-provider-error',
            'OpenAI did not return a chat answer.',
          );
        }

        return content;
      } catch (error: unknown) {
        if (error instanceof ChatProviderError) {
          throw error;
        }

        throw new ChatProviderError(
          'chat-provider-error',
          'OpenAI chat answer generation failed. Check network access and the configured chat model, then try again.',
        );
      }
    },
    model,
    async *streamText(messages: readonly ChatProviderMessage[]): AsyncIterable<string> {
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        let emittedToken = false;
        const abortTimeout = createAbortTimeout(timeoutMs);

        try {
          const stream = await client.chat.completions.create(
            {
              messages: toOpenAIMessages(messages),
              model,
              stream: true,
              temperature: 0.2,
            },
            { signal: abortTimeout.signal },
          );

          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta.content;

            if (content) {
              emittedToken = true;
              yield content;
            }
          }

          if (!emittedToken) {
            throw new ChatProviderError(
              'chat-provider-error',
              'OpenAI did not return a chat answer.',
            );
          }

          return;
        } catch (error: unknown) {
          if (
            attempt < maxRetries &&
            !emittedToken &&
            !(error instanceof ChatProviderError) &&
            isTransientOpenAIError(error)
          ) {
            await sleep(retryDelayMs * (attempt + 1));
            continue;
          }

          if (error instanceof ChatProviderError) {
            throw error;
          }

          throw new ChatProviderError(
            'chat-provider-error',
            'OpenAI chat answer generation failed. Check network access and the configured chat model, then try again.',
          );
        } finally {
          abortTimeout.clear();
        }
      }

      throw new ChatProviderError(
        'chat-provider-error',
        'OpenAI chat answer generation failed. Check network access and the configured chat model, then try again.',
      );
    },
  };
}
