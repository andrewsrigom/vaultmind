import { describe, expect, it } from 'vitest';

import {
  createEventStreamResponse,
  encodeServerSentEvent,
  eventStreamHeaders,
} from '@/lib/api/stream';

describe('eventStreamHeaders', () => {
  it('sets SSE cache and content-type protections', () => {
    expect(eventStreamHeaders['Cache-Control']).toBe('no-cache, no-store, no-transform');
    expect(eventStreamHeaders['Content-Type']).toBe('text/event-stream; charset=utf-8');
    expect(eventStreamHeaders['X-Content-Type-Options']).toBe('nosniff');
  });
});

describe('encodeServerSentEvent', () => {
  it('serializes server-sent event frames', () => {
    const encoded = encodeServerSentEvent({
      data: { message: 'ok' },
      encoder: new TextEncoder(),
      event: 'done',
    });

    expect(new TextDecoder().decode(encoded)).toBe('event: done\ndata: {"message":"ok"}\n\n');
  });
});

describe('createEventStreamResponse', () => {
  it('creates an SSE response and closes after events are sent', async () => {
    const response = createEventStreamResponse((send) => {
      send('ready', { ok: true });
      send('done', { count: 1 });
    });

    await expect(response.text()).resolves.toBe(
      'event: ready\ndata: {"ok":true}\n\n' + 'event: done\ndata: {"count":1}\n\n',
    );
    expect(response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
  });
});
