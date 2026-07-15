import type { NewTokenItem, TokenStreamMessage, TokenStreamStatus } from "./new-token";

export type ClientTokenStreamState = {
  status: TokenStreamStatus;
  tokens: NewTokenItem[];
  transport: "idle" | "connecting" | "open" | "reconnecting" | "closed";
};

type Listener = (state: ClientTokenStreamState) => void;
type StreamBootstrap = {
  source: EventSource | null;
  messages: TokenStreamMessage[];
  transport: ClientTokenStreamState["transport"];
  lastEventAt: number;
  open: () => void;
};

declare global {
  interface Window {
    __SOLARD_STREAM_BOOT__?: StreamBootstrap;
  }
}

const listeners = new Set<Listener>();
let source: EventSource | null = null;
let reopenTimer: ReturnType<typeof setTimeout> | null = null;
let watchdogTimer: ReturnType<typeof setInterval> | null = null;
let bridgeReady = false;
let state: ClientTokenStreamState = {
  status: { state: "idle", source: null, label: "new-token stream", message: "Connecting automatically", connectedAt: null, retryAt: null },
  tokens: [],
  transport: "idle",
};

function publish() {
  listeners.forEach((listener) => listener(state));
}

function mergeToken(token: NewTokenItem, prepend: boolean) {
  const existingIndex = state.tokens.findIndex((item) => item.mint === token.mint);
  const tokens = state.tokens.slice();
  if (existingIndex >= 0) tokens[existingIndex] = token;
  else if (prepend) tokens.unshift(token);
  else tokens.push(token);
  tokens.sort((a, b) => b.observedAt - a.observedAt);
  state = { ...state, tokens: tokens.slice(0, 100) };
}

function handle(message: TokenStreamMessage) {
  if (message.type === "snapshot") {
    state = {
      ...state,
      status: message.snapshot.status,
      tokens: message.snapshot.tokens.slice(0, 100).sort((a, b) => b.observedAt - a.observedAt),
    };
  } else if (message.type === "status") {
    state = { ...state, status: message.status };
  } else if (message.type === "token") {
    mergeToken(message.token, true);
  } else if (message.type === "update") {
    mergeToken(message.token, false);
  }
  publish();
}

function parseEvent(event: MessageEvent<string>) {
  try {
    handle(JSON.parse(event.data) as TokenStreamMessage);
  } catch {
    // Ignore malformed upstream frames without interrupting reconnects.
  }
}

function bridgeBootstrap() {
  if (bridgeReady || typeof window === "undefined") return false;
  const boot = window.__SOLARD_STREAM_BOOT__;
  if (!boot) return false;
  bridgeReady = true;
  boot.messages.forEach(handle);
  state = { ...state, transport: boot.transport };
  const onMessage = (event: Event) => handle((event as CustomEvent<TokenStreamMessage>).detail);
  const onTransport = (event: Event) => {
    state = { ...state, transport: (event as CustomEvent<ClientTokenStreamState["transport"]>).detail };
    publish();
  };
  window.addEventListener("solard-stream-message", onMessage);
  window.addEventListener("solard-stream-transport", onTransport);
  boot.open();
  publish();
  return true;
}

function clearReopenTimer() {
  if (!reopenTimer) return;
  clearTimeout(reopenTimer);
  reopenTimer = null;
}

function scheduleReopen() {
  if (reopenTimer || typeof EventSource === "undefined") return;
  reopenTimer = setTimeout(() => {
    reopenTimer = null;
    source?.close();
    source = null;
    ensureSource();
  }, 1_500);
}

function ensureWatchdog() {
  if (watchdogTimer || typeof window === "undefined") return;
  watchdogTimer = setInterval(() => {
    const boot = window.__SOLARD_STREAM_BOOT__;
    if (boot) {
      if (!boot.source || boot.source.readyState === EventSource.CLOSED) boot.open();
      return;
    }
    if (source?.readyState === EventSource.CLOSED) scheduleReopen();
  }, 5_000);
}

function ensureSource() {
  if (typeof EventSource === "undefined") return;
  ensureWatchdog();
  if (bridgeBootstrap()) return;
  if (source) return;
  clearReopenTimer();
  state = { ...state, transport: "connecting" };
  publish();

  const next = new EventSource("/api/token-stream");
  source = next;
  next.addEventListener("snapshot", parseEvent as EventListener);
  next.addEventListener("status", parseEvent as EventListener);
  next.addEventListener("token", parseEvent as EventListener);
  next.addEventListener("update", parseEvent as EventListener);
  next.addEventListener("heartbeat", () => {
    if (source !== next) return;
    state = { ...state, transport: "open" };
    publish();
  });
  next.onopen = () => {
    if (source !== next) return;
    clearReopenTimer();
    state = { ...state, transport: "open" };
    publish();
  };
  next.onerror = () => {
    if (source !== next) return;
    state = { ...state, transport: "reconnecting" };
    publish();
    if (next.readyState === EventSource.CLOSED) scheduleReopen();
  };
}

export function subscribeTokenStream(listener: Listener) {
  listeners.add(listener);
  listener(state);
  ensureSource();

  return () => {
    listeners.delete(listener);
    // The shared EventSource remains open across TradJS remounts.
  };
}
