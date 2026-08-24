export type ChatProviderMessage = {
  content: string;
  role: 'assistant' | 'system' | 'user';
};

export type ChatProvider = {
  generateText(messages: readonly ChatProviderMessage[]): Promise<string>;
  model: string;
  streamText(messages: readonly ChatProviderMessage[]): AsyncIterable<string>;
};

export type ChatProviderErrorCode = 'chat-config-error' | 'chat-provider-error';

export class ChatProviderError extends Error {
  code: ChatProviderErrorCode;

  constructor(code: ChatProviderErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
