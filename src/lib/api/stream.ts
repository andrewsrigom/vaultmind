export const eventStreamHeaders = {
  'Cache-Control': 'no-cache, no-store, no-transform',
  Connection: 'keep-alive',
  'Content-Type': 'text/event-stream; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
} as const;

export type SendServerSentEvent = (event: string, data: unknown) => void;

export function encodeServerSentEvent({
  data,
  encoder,
  event,
}: {
  data: unknown;
  encoder: TextEncoder;
  event: string;
}): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function createEventStreamResponse(
  start: (send: SendServerSentEvent) => Promise<void> | void,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send: SendServerSentEvent = (event, data) => {
        controller.enqueue(encodeServerSentEvent({ data, encoder, event }));
      };

      try {
        await start(send);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: eventStreamHeaders });
}
