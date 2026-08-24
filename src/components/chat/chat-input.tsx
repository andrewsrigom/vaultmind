'use client';

import { Search, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

import type { FormEvent, KeyboardEvent } from 'react';

type ChatInputProps = {
  isDisabled: boolean;
  isSubmitting: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  strings: {
    ask: string;
    asking: string;
    help: string;
    label: string;
    placeholder: string;
  };
  value: string;
};

export function ChatInput({
  isDisabled,
  isSubmitting,
  onChange,
  onSubmit,
  strings,
  value,
}: ChatInputProps) {
  const isSendDisabled = isDisabled || isSubmitting || value.trim().length === 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) {
      return;
    }

    event.preventDefault();

    if (!isSendDisabled) {
      onSubmit();
    }
  }

  return (
    <div className="grid gap-2">
      <form
        className="flex min-h-16 items-end gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3 shadow-sm"
        onSubmit={handleSubmit}
      >
        <label className="sr-only" htmlFor="chat-message">
          {strings.label}
        </label>
        <span className="flex size-10 shrink-0 items-center justify-center text-[var(--muted-foreground)]">
          <Search aria-hidden="true" className="size-5" />
        </span>
        <Textarea
          aria-describedby="chat-message-help"
          className="max-h-32 min-h-10 flex-1 resize-none border-0 bg-transparent px-1 py-2 text-sm leading-6 shadow-none focus-visible:ring-0"
          disabled={isDisabled || isSubmitting}
          id="chat-message"
          maxLength={4_000}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          onKeyDown={handleKeyDown}
          placeholder={strings.placeholder}
          rows={1}
          value={value}
        />
        <p className="sr-only" id="chat-message-help">
          {strings.help}
        </p>
        <Button
          aria-label={isSubmitting ? strings.asking : strings.ask}
          className="h-11 shrink-0 font-semibold disabled:opacity-45"
          disabled={isSendDisabled}
          type="submit"
        >
          {isSubmitting ? (
            <Spinner aria-hidden="true" />
          ) : (
            <>
              <Send aria-hidden="true" className="size-4" />
              <span className="hidden sm:inline">{strings.ask}</span>
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
