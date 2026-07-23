import { tokenStreamManager } from "../../lib/token-stream-server";
import type { TokenStreamMessage } from "../../lib/new-token";
import { serverMeasure } from "../../../src/observability/server";

function eventFrame(event: string, payload: unknown): Uint8Array {
  return new TextEncoder().encode(
    `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`,
  );
}

export function GET(request: Request) {
  return serverMeasure.measureSync(
    {
      label: "GET /api/token-stream",
      result: (value: Response) => ({ status: value.status }),
    },
    () => {
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let unsubscribe: (() => void) | null = null;
      let closed = false;

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (message: TokenStreamMessage) => {
            if (closed) return;
            try {
              controller.enqueue(eventFrame(message.type, message));
            } catch {
              closed = true;
            }
          };

          unsubscribe = tokenStreamManager.subscribe(send);
          send({ type: "snapshot", snapshot: tokenStreamManager.snapshot() });
          heartbeat = setInterval(() => {
            if (closed) return;
            try {
              controller.enqueue(
                new TextEncoder().encode(
                  `event: heartbeat\ndata: ${Date.now()}\n\n`,
                ),
              );
            } catch {
              closed = true;
            }
          }, 10_000);

          const close = () => {
            if (closed) return;
            closed = true;
            if (heartbeat) clearInterval(heartbeat);
            heartbeat = null;
            unsubscribe?.();
            unsubscribe = null;
            try {
              controller.close();
            } catch {
              // The browser may already have closed the stream.
            }
          };
          request.signal.addEventListener("abort", close, { once: true });
        },
        cancel() {
          closed = true;
          if (heartbeat) clearInterval(heartbeat);
          heartbeat = null;
          unsubscribe?.();
          unsubscribe = null;
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    },
    (error: unknown) =>
      new Response(
        `Token stream failed: ${error instanceof Error ? error.message : String(error)}`,
        { status: 500 },
      ),
  );
}
