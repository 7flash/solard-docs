import {
  configure,
  createMeasure,
  formatDuration,
  safeStringify,
  type MeasureLogEvent,
} from "measure-fn";
import { errorRecord } from "./error";
import { traceLabel } from "./action";

type BrowserTraceEvent = {
  type: MeasureLogEvent["type"];
  id: string;
  label: string;
  depth: number;
  duration?: number;
  result?: string;
  error?: ReturnType<typeof errorRecord>;
  value?: string;
  budget?: number;
  at: number;
};

const sessionId =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
const queue: BrowserTraceEvent[] = [];
let flushTimer: number | null = null;
let installed = false;

function lineFor(event: MeasureLogEvent): string {
  const id = `[${event.id}]`;
  if (event.type === "start") return `${id} → ${event.label}`;
  if (event.type === "annotation") return `${id} = ${event.label}`;
  if (event.type === "error") {
    const detail = errorRecord(event.error);
    return `${id} ✗ ${event.label} ${formatDuration(event.duration)} (${detail.code !== undefined ? `${detail.code}: ` : ""}${detail.message})`;
  }
  const result =
    event.result === undefined ? "" : ` → ${safeStringify(event.result, 220)}`;
  const budget =
    event.budget !== undefined && event.duration > event.budget
      ? ` ⚠ OVER BUDGET (${formatDuration(event.budget)})`
      : "";
  return `${id} ✓ ${event.label} ${formatDuration(event.duration)}${result}${budget}`;
}

function enqueue(event: MeasureLogEvent): void {
  const trace: BrowserTraceEvent = {
    type: event.type,
    id: event.id,
    label: event.label,
    depth: event.depth,
    at: Date.now(),
  };
  if ("duration" in event) trace.duration = event.duration;
  if (event.type === "success" && event.result !== undefined) {
    trace.result = safeStringify(event.result, 800);
  }
  if (event.type === "error") trace.error = errorRecord(event.error);
  if ("value" in event && event.value !== undefined)
    trace.value = safeStringify(event.value, 500);
  if ("budget" in event && event.budget !== undefined)
    trace.budget = event.budget;
  queue.push(trace);
  if (queue.length > 100) queue.splice(0, queue.length - 100);
  scheduleFlush();
}

function scheduleFlush(): void {
  if (typeof window === "undefined" || flushTimer !== null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushClientTraces();
  }, 350);
}

export async function flushClientTraces(useBeacon = false): Promise<void> {
  if (typeof window === "undefined" || queue.length === 0) return;
  const events = queue.splice(0, 40);
  const payload = JSON.stringify({
    sessionId,
    href: window.location.href,
    userAgent: navigator.userAgent,
    events,
  });
  try {
    if (useBeacon && typeof navigator.sendBeacon === "function") {
      const sent = navigator.sendBeacon(
        "/api/client-logs",
        new Blob([payload], { type: "application/json" }),
      );
      if (!sent) queue.unshift(...events);
      return;
    }
    const response = await fetch("/api/client-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    });
    if (!response.ok) queue.unshift(...events);
  } catch {
    queue.unshift(...events);
  }
}

export const clientMeasure = createMeasure("client");

export function installClientObservability(): () => void {
  if (installed || typeof window === "undefined") return () => undefined;
  installed = true;
  configure({
    maxResultLength: 260,
    summarize: true,
    stripScopePrefix: true,
    logger: (event) => {
      const line = lineFor(event);
      if (event.type === "error") console.error(line, errorRecord(event.error));
      else console.log(line);
      enqueue(event);
    },
  });

  const captureGlobalFailure = (label: string, value: unknown) => {
    const detail = errorRecord(value);
    console.error(`[client:window] ${label}: ${detail.message}`, detail);
    // Do not throw inside the global error observer. A measured throw here would
    // create a second unhandled rejection for the original failure.
    clientMeasure.note(
      traceLabel(label, {
        captured: true,
        code: detail.code === undefined ? undefined : String(detail.code),
        message: detail.message,
      }),
    );
  };
  const onError = (event: ErrorEvent) => {
    captureGlobalFailure(
      "Window error",
      event.error || new Error(event.message),
    );
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    captureGlobalFailure("Unhandled rejection", event.reason);
  };
  const onPageHide = () => void flushClientTraces(true);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  window.addEventListener("pagehide", onPageHide);
  clientMeasure.note(traceLabel("Client observability ready", { sessionId }));

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    window.removeEventListener("pagehide", onPageHide);
    void flushClientTraces(true);
    installed = false;
  };
}

export const clientSessionId = sessionId;
