import { describe, expect, it } from 'vitest';

import { extractJsonObjectText, parseJsonObjectFromModelOutput } from '@/lib/model-json';

describe('extractJsonObjectText', () => {
  it('extracts JSON objects from plain or fenced model output', () => {
    expect(extractJsonObjectText('{"ok":true}')).toBe('{"ok":true}');
    expect(extractJsonObjectText('```json\n{"ok":true}\n```')).toBe('{"ok":true}');
  });

  it('extracts the first complete object from surrounding commentary', () => {
    expect(extractJsonObjectText('Here is JSON:\n{"ok":true}\nDone.')).toBe('{"ok":true}');
  });

  it('returns null when no JSON object is present', () => {
    expect(extractJsonObjectText('not json')).toBeNull();
  });
});

describe('parseJsonObjectFromModelOutput', () => {
  it('parses extracted JSON objects', () => {
    expect(parseJsonObjectFromModelOutput('```json\n{"count":1}\n```')).toEqual({
      count: 1,
    });
  });

  it('throws when the output does not include a JSON object', () => {
    expect(() => parseJsonObjectFromModelOutput('not json')).toThrow(
      'Model output did not contain a JSON object.',
    );
  });
});
