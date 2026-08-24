import { describe, expect, it } from 'vitest';

import {
  createPromptMessages,
  createPromptSnippet,
  formatPromptDocument,
  getInsufficientContextAnswer,
  getPromptOutputLanguageInstruction,
  getSecurityRefusalAnswer,
  joinPromptLines,
  normalizePromptText,
  truncatePromptContent,
} from '@/lib/prompts';

describe('joinPromptLines', () => {
  it('removes conditional empty values while preserving intentional blank lines', () => {
    expect(joinPromptLines(['First line', '', null, false, undefined, 'Second line'])).toBe(
      'First line\n\nSecond line',
    );
  });
});

describe('createPromptMessages', () => {
  it('creates system and user messages with joined prompt content', () => {
    expect(
      createPromptMessages({
        system: ['System'],
        user: ['Question:', 'What changed?'],
      }),
    ).toEqual([
      {
        content: 'System',
        role: 'system',
      },
      {
        content: 'Question:\nWhat changed?',
        role: 'user',
      },
    ]);
  });
});

describe('normalizePromptText', () => {
  it('collapses whitespace for compact prompt snippets', () => {
    expect(normalizePromptText('  Alpha\n\nBeta\tGamma  ')).toBe('Alpha Beta Gamma');
  });
});

describe('createPromptSnippet', () => {
  it('normalizes and truncates snippets with ellipsis', () => {
    expect(createPromptSnippet('  Alpha\nBeta  ', 20)).toBe('Alpha Beta');
    expect(createPromptSnippet('Alpha Beta Gamma', 12)).toBe('Alpha Bet...');
  });
});

describe('truncatePromptContent', () => {
  it('trims and marks over-budget content', () => {
    expect(truncatePromptContent('  short content  ', 20)).toBe('short content');
    expect(truncatePromptContent('abcdef', 3)).toBe('abc\n\n[truncated]');
  });
});

describe('formatPromptDocument', () => {
  it('formats document context with stable labels and content', () => {
    expect(
      formatPromptDocument({
        content: '  # Plan\n\nDocument content.  ',
        fields: [
          {
            label: 'path',
            value: 'docs/plan.md',
          },
          {
            label: 'title',
            value: 'Plan',
          },
        ],
        index: 0,
        maxContentCharacters: 100,
      }),
    ).toBe(
      [
        'Document 1',
        'path: docs/plan.md',
        'title: Plan',
        'content:',
        '# Plan\n\nDocument content.',
      ].join('\n'),
    );
  });
});

describe('getPromptOutputLanguageInstruction', () => {
  it('uses the user preference when provided', () => {
    expect(
      getPromptOutputLanguageInstruction({
        language: 'pt-BR',
        outputName: 'answer',
      }),
    ).toBe(
      'Write the user-visible answer in Portuguese unless the user explicitly asks for another language.',
    );
    expect(
      getPromptOutputLanguageInstruction({
        language: 'en',
        outputName: 'answer',
      }),
    ).toBe(
      'Write the user-visible answer in English unless the user explicitly asks for another language.',
    );
  });

  it('falls back to the user request language when no preference is provided', () => {
    expect(getPromptOutputLanguageInstruction({ outputName: 'answer' })).toBe(
      'Write the user-visible answer in the same language as the user request when possible.',
    );
  });
});

describe('getInsufficientContextAnswer', () => {
  it('localizes safe fallback answers', () => {
    expect(getInsufficientContextAnswer('en')).toBe(
      'The workspace does not contain enough information to answer that.',
    );
    expect(getInsufficientContextAnswer('pt-BR')).toBe(
      'O workspace não contém informações suficientes para responder a isso.',
    );
  });
});

describe('getSecurityRefusalAnswer', () => {
  it('localizes safe security refusal answers', () => {
    expect(getSecurityRefusalAnswer('en')).toContain('I cannot reveal system prompts');
    expect(getSecurityRefusalAnswer('pt-BR')).toContain('Não posso revelar prompts internos');
  });
});
