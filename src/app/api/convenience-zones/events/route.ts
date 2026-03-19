import { addClient, removeClient } from '@/lib/sse-broadcast';

export const dynamic = 'force-dynamic';

export async function GET() {
  const encoder = new TextEncoder();

  let ctrl: ReadableStreamDefaultController | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      ctrl = controller;
      addClient(controller);
      controller.enqueue(encoder.encode(': connected\n\n'));

      heartbeatTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          removeClient(controller);
        }
      }, 45_000);
    },
    cancel() {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (ctrl) removeClient(ctrl);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    }
  });
}
