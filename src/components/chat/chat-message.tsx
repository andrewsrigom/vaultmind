import { Flag, ThumbsDown, ThumbsUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

import type { ChatDisplayMessage } from '@/components/chat/types';
import type { TrustSignalType } from '@/db/schema';

export type ChatFeedbackSignal = TrustSignalType;
export type ChatFeedbackState = 'idle' | 'saved' | 'saving';

type ChatMessageProps = {
  assistantLabel: string;
  feedbackState?: ChatFeedbackState;
  feedbackStrings?: {
    conflicting: string;
    helpful: string;
    label: string;
    missingSource: string;
    notHelpful: string;
    outdated: string;
    report: string;
    saved: string;
    saving: string;
    wrongScope: string;
  };
  isLoading?: boolean;
  message: ChatDisplayMessage;
  onFeedbackSubmit?: (messageId: string, signal: ChatFeedbackSignal) => void;
  userLabel: string;
};

export function ChatMessage({
  assistantLabel,
  feedbackState = 'idle',
  feedbackStrings,
  isLoading = false,
  message,
  onFeedbackSubmit,
  userLabel,
}: ChatMessageProps) {
  const isAssistant = message.role === 'assistant';
  const feedbackDisabled = feedbackState === 'saving' || feedbackState === 'saved';
  const showAssistantActions = isAssistant && !isLoading && feedbackStrings && onFeedbackSubmit;
  const reportOptions: Array<[ChatFeedbackSignal, string]> = feedbackStrings
    ? [
        ['missing-source', feedbackStrings.missingSource],
        ['outdated', feedbackStrings.outdated],
        ['conflicting', feedbackStrings.conflicting],
        ['wrong-scope', feedbackStrings.wrongScope],
      ]
    : [];

  return (
    <article
      aria-label={isAssistant ? assistantLabel : userLabel}
      className={cn('flex', isAssistant ? 'justify-start' : 'justify-end')}
    >
      <div className="grid max-w-[min(44rem,100%)] gap-2">
        <div
          className={cn(
            'whitespace-pre-wrap break-words text-sm leading-7',
            isAssistant
              ? 'text-[var(--foreground)]'
              : 'rounded-3xl bg-[var(--card)] px-4 py-2 text-[var(--foreground)]',
            isLoading ? 'text-[var(--muted-foreground)]' : null,
          )}
        >
          <span className="sr-only">{isAssistant ? assistantLabel : userLabel}</span>
          {message.content}
          {isAssistant && isLoading ? (
            <span
              aria-hidden="true"
              className="ml-1 inline-block h-4 w-1 translate-y-0.5 animate-pulse rounded-sm bg-[var(--muted-foreground)]"
            />
          ) : null}
        </div>
        {showAssistantActions ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
            {feedbackStrings && onFeedbackSubmit ? (
              <>
                <span className="sr-only">{feedbackStrings.label}</span>
                <Button
                  aria-label={feedbackStrings.helpful}
                  disabled={feedbackDisabled}
                  onClick={() => {
                    onFeedbackSubmit(message.id, 'helpful');
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <ThumbsUp aria-hidden="true" className="size-3.5" />
                  {feedbackStrings.helpful}
                </Button>
                <Button
                  aria-label={feedbackStrings.notHelpful}
                  disabled={feedbackDisabled}
                  onClick={() => {
                    onFeedbackSubmit(message.id, 'not-helpful');
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <ThumbsDown aria-hidden="true" className="size-3.5" />
                  {feedbackStrings.notHelpful}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button disabled={feedbackDisabled} size="sm" type="button" variant="outline">
                      <Flag aria-hidden="true" className="size-3.5" />
                      {feedbackStrings.report}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {reportOptions.map(([signal, label]) => (
                      <DropdownMenuItem
                        disabled={feedbackDisabled}
                        key={signal}
                        onSelect={() => {
                          onFeedbackSubmit(message.id, signal);
                        }}
                      >
                        {label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : null}
            {feedbackStrings && feedbackState !== 'idle' ? (
              <span aria-live="polite">
                {feedbackState === 'saving' ? feedbackStrings.saving : feedbackStrings.saved}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
