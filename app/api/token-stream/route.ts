import { tokenStreamManager } from "../../lib/token-stream-server";
import type { TokenStreamMessage } from "../../lib/new-token";

const encoder = new TextEncoder();

function encodeEvent(event: string, data: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function GET(request: Request) {
  tokenStreamManager.ensureStarted();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let cleaned = false;
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let unsubscribe = () => {};

      cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
      };

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encodeEvent(event, data));
        } catch {
          cleanup();
        }
      };

      const onMessage = (message: TokenStreamMessage) => send(message.type, message);
      unsubscribe = tokenStreamManager.subscribe(onMessage);
      heartbeat = setInterval(() => send("heartbeat", { at: Date.now() }), 10_000);

      try { controller.enqueue(encoder.encode(": solard token stream\nretry: 1500\n\n")); } catch { cleanup(); return; }
      send("snapshot", { type: "snapshot", snapshot: tokenStreamManager.snapshot() });
      request.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() { cleanup(); },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Content-Encoding": "identity",
    },
  });
}
