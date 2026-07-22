import { serverMeasure } from "../../../src/observability/server";
import { getTokenFeed } from "../../../src/server/token-feed";

export function GET(request: Request) {
  const response = serverMeasure.measureSync(
    {
      label: "GET /api/token-stream",
      result: (value: Response) => ({ status: value.status }),
    },
    () => {
      const encoder = new TextEncoder();
      let timer: ReturnType<typeof setInterval> | null = null;
      let closed = false;
      let sequence = 0;

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const push = async () => {
            if (closed) return;
            sequence += 1;
            await serverMeasure.measure(
              {
                label: "SSE token snapshot",
                sequence,
                budget: 4_000,
                result: (count: number) => ({ tokens: count }),
              },
              async () => {
                const payload = await getTokenFeed();
                if (closed) return payload.tokens.length;
                controller.enqueue(
                  encoder.encode(
                    `event: snapshot\ndata: ${JSON.stringify(payload)}\n\n`,
                  ),
                );
                return payload.tokens.length;
              },
            );
          };

          controller.enqueue(encoder.encode(": SOLARD token stream\n\n"));
          void push();
          timer = setInterval(() => void push(), 10_000);

          request.signal.addEventListener(
            "abort",
            () => {
              closed = true;
              if (timer) clearInterval(timer);
              timer = null;
              serverMeasure.measure({
                label: "SSE client disconnected",
                sequence,
              });
              try {
                controller.close();
              } catch {
                /* already closed */
              }
            },
            { once: true },
          );
        },
        cancel() {
          closed = true;
          if (timer) clearInterval(timer);
          timer = null;
          serverMeasure.measure({ label: "SSE stream cancelled", sequence });
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
    (error) =>
      new Response(
        `Token stream failed: ${error instanceof Error ? error.message : String(error)}`,
        { status: 500 },
      ),
  );
  return (
    response ||
    new Response("Token stream failed before initialization.", { status: 500 })
  );
}
