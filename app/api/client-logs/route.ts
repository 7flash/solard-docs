import { formatDuration } from "measure-fn";
import { traceLabel } from "../../../src/observability/action";
import {
  serverErrorResponse,
  serverMeasure,
} from "../../../src/observability/server";

type ClientEvent = {
  type?: "start" | "success" | "error" | "annotation";
  id?: string;
  label?: string;
  duration?: number;
  result?: string;
  error?: { message?: string; code?: string | number; stack?: string };
  at?: number;
};

type ClientLogPayload = {
  sessionId?: string;
  href?: string;
  userAgent?: string;
  events?: ClientEvent[];
};

function clean(value: unknown, max = 180): string {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return text.replace(/[\r\n]+/g, " ").slice(0, max);
}

function printClientEvent(sessionId: string, event: ClientEvent): void {
  const id = clean(event.id || "?", 32);
  const label = clean(event.label || "Client event", 160);
  const prefix = `[browser:${sessionId}] [client:${id}]`;
  if (event.type === "error") {
    const code = event.error?.code !== undefined ? `${event.error.code}: ` : "";
    console.error(
      `${prefix} ✗ ${label} ${formatDuration(Number(event.duration || 0))} (${code}${clean(event.error?.message || "Unknown error", 240)})`,
    );
    if (event.error?.stack)
      console.error(`${prefix} ${clean(event.error.stack, 1_600)}`);
    return;
  }
  if (event.type === "start") {
    console.log(`${prefix} → ${label}`);
    return;
  }
  if (event.type === "annotation") {
    console.log(`${prefix} = ${label}`);
    return;
  }
  const result = event.result ? ` → ${clean(event.result, 260)}` : "";
  console.log(
    `${prefix} ✓ ${label} ${formatDuration(Number(event.duration || 0))}${result}`,
  );
}

export async function POST(request: Request) {
  try {
    return await serverMeasure("POST /api/client-logs", async () => {
      const body = await serverMeasure(
        "Parse browser traces",
        () => request.json() as Promise<ClientLogPayload>,
      );
      if (!body || typeof body !== "object")
        return Response.json({ ok: false }, { status: 400 });
      const sessionId = clean(body.sessionId || "unknown", 24);
      const events = Array.isArray(body.events) ? body.events.slice(0, 50) : [];
      await serverMeasure(
        traceLabel("Print browser traces", { sessionId, count: events.length }),
        async () => {
          for (const event of events) printClientEvent(sessionId, event);
          return events.length;
        },
      );
      return Response.json(
        { ok: true, accepted: events.length },
        {
          headers: { "Cache-Control": "no-store" },
        },
      );
    });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
