import {
  asArray,
  bestDexPairsByToken,
  fetchDexJson,
} from "./dexscreener-server";
import type {
  NewTokenItem,
  NewTokenSource,
  TokenStreamMessage,
  TokenStreamSnapshot,
  TokenStreamStatus,
} from "./new-token";
import { streamSourceLabel } from "./new-token";

const MAX_BUFFER = 100;
const MAX_SEEN = 2_000;
const MAX_RPC_FETCHES = 6;
const ENRICH_DELAYS = [0, 5_000, 15_000, 30_000, 60_000, 120_000];
const TX_RETRY_DELAYS = [0, 500, 1_500, 3_000, 6_000];
const DEFAULT_DEX_WS = "wss://api.dexscreener.com/token-profiles/latest/v1";
const DEFAULT_PUMP_WS = "wss://pumpportal.fun/api/data";
const DEFAULT_SOLANA_RPC = "https://api.mainnet-beta.solana.com";
const PUMP_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const DEFAULT_PROFILE_POLL_MS = 15_000;
const MIN_PROFILE_POLL_MS = 10_000;
const MAX_PROFILE_POLL_MS = 60_000;

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_MAP = new Map(
  [...BASE58_ALPHABET].map((character, index) => [character, index]),
);

type Listener = (message: TokenStreamMessage) => void;
type EnrichmentJob = { attempt: number; dueAt: number };
type ParsedPumpCreate = {
  name: string;
  symbol: string;
  uri: string;
  creator: string | null;
};

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function nullableText(value: unknown) {
  const result = text(value);
  return result || null;
}

function nullableNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function timestamp(value: unknown) {
  const number = nullableNumber(value);
  if (number == null) return null;
  return number < 10_000_000_000 ? number * 1_000 : number;
}

function idFor(source: NewTokenSource, mint: string) {
  return `${source}:${mint}`;
}

function profilePollMs() {
  const configured = Number.parseInt(
    process.env.DEXSCREENER_PROFILE_POLL_MS ?? "",
    10,
  );
  if (!Number.isFinite(configured)) return DEFAULT_PROFILE_POLL_MS;
  return Math.min(
    MAX_PROFILE_POLL_MS,
    Math.max(MIN_PROFILE_POLL_MS, configured),
  );
}

function solanaRpcUrl() {
  return (
    process.env.SOLANA_RPC_URL ??
    process.env.HELIUS_RPC_URL ??
    DEFAULT_SOLANA_RPC
  );
}

function solanaWsUrl() {
  const explicit = process.env.SOLANA_WS_URL ?? process.env.HELIUS_WS_URL;
  if (explicit) return explicit;
  return solanaRpcUrl()
    .replace(/^https:/, "wss:")
    .replace(/^http:/, "ws:");
}

function decodeBase58(value: string) {
  if (!value) return new Uint8Array();
  const bytes = [0];
  for (const character of value) {
    const digit = BASE58_MAP.get(character);
    if (digit == null) return new Uint8Array();
    let carry = digit;
    for (let index = 0; index < bytes.length; index += 1) {
      const next = bytes[index] * 58 + carry;
      bytes[index] = next & 0xff;
      carry = next >> 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const character of value) {
    if (character !== "1") break;
    bytes.push(0);
  }
  return Uint8Array.from(bytes.reverse());
}

function encodeBase58(bytes: Uint8Array) {
  if (!bytes.length) return "";
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      const next = digits[index] * 256 + carry;
      digits[index] = next % 58;
      carry = Math.floor(next / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let leading = 0;
  for (const byte of bytes) {
    if (byte !== 0) break;
    leading += 1;
  }
  return (
    "1".repeat(leading) +
    digits
      .reverse()
      .map((digit) => BASE58_ALPHABET[digit])
      .join("")
  );
}

function parsePumpCreateData(data: unknown): ParsedPumpCreate | null {
  if (typeof data !== "string") return null;
  const bytes = decodeBase58(data);
  if (bytes.length < 20) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  let offset = 8;
  const readString = () => {
    if (offset + 4 > bytes.length) throw new Error("invalid Pump create data");
    const length = view.getUint32(offset, true);
    offset += 4;
    if (length > 2_048 || offset + length > bytes.length)
      throw new Error("invalid Pump create string");
    const result = decoder.decode(bytes.subarray(offset, offset + length));
    offset += length;
    return result;
  };
  try {
    const name = readString().trim();
    const symbol = readString().trim();
    const uri = readString().trim();
    const creator =
      offset + 32 <= bytes.length
        ? encodeBase58(bytes.subarray(offset, offset + 32))
        : null;
    if (!name && !symbol) return null;
    return { name, symbol, uri, creator };
  } catch {
    return null;
  }
}

function publicKey(value: any): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value.pubkey === "string") return value.pubkey;
  return null;
}

function instructionProgramId(instruction: any, accountKeys: any[]) {
  const direct = publicKey(instruction?.programId);
  if (direct) return direct;
  const index = Number(instruction?.programIdIndex);
  return Number.isInteger(index) ? publicKey(accountKeys[index]) : null;
}

function instructionAccounts(instruction: any, accountKeys: any[]) {
  if (!Array.isArray(instruction?.accounts)) return [] as string[];
  return instruction.accounts
    .map((account: any) => {
      if (typeof account === "number") return publicKey(accountKeys[account]);
      return publicKey(account);
    })
    .filter(Boolean) as string[];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class TokenStreamManager {
  private listeners = new Set<Listener>();
  private tokens: NewTokenItem[] = [];
  private byMint = new Map<string, NewTokenItem>();
  private seen = new Set<string>();
  private enrichments = new Map<string, EnrichmentJob>();
  private pendingSignatures = new Set<string>();
  private rpcQueue: string[] = [];
  private activeRpcFetches = 0;
  private websocket: WebSocket | null = null;
  private started = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private enrichTimer: ReturnType<typeof setInterval> | null = null;
  private profilePollTimer: ReturnType<typeof setInterval> | null = null;
  private profilePollBusy = false;
  private dexPollHealthy = false;
  private reconnectAttempt = 0;
  private source: NewTokenSource | null = null;
  private status: TokenStreamStatus = {
    state: "idle",
    source: null,
    label: "new-token stream",
    message: "Starting automatically",
    connectedAt: null,
    retryAt: null,
  };

  ensureStarted() {
    if (this.started) return;
    this.started = true;
    this.enrichTimer = setInterval(() => void this.flushEnrichment(), 1_000);
    this.connect();
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    this.ensureStarted();
    return () => this.listeners.delete(listener);
  }

  snapshot(): TokenStreamSnapshot {
    this.ensureStarted();
    return {
      status: this.status,
      tokens: this.tokens.slice(),
      generatedAt: Date.now(),
    };
  }

  private publish(message: TokenStreamMessage) {
    this.listeners.forEach((listener) => {
      try {
        listener(message);
      } catch {
        // One browser connection must not interrupt the shared stream.
      }
    });
  }

  private setStatus(patch: Partial<TokenStreamStatus>) {
    this.status = { ...this.status, ...patch };
    this.publish({ type: "status", status: this.status });
  }

  private configuredSource(): NewTokenSource {
    const requested = (
      process.env.NEW_TOKEN_STREAM_SOURCE ?? "auto"
    ).toLowerCase();
    if (requested === "pumpportal") return "pumpportal";
    if (
      requested === "solana" ||
      requested === "solana-rpc" ||
      requested === "rpc"
    )
      return "solana-rpc";
    if (requested === "dexscreener" || requested === "dexscreener-profile")
      return "dexscreener-profile";
    return process.env.PUMPPORTAL_API_KEY || process.env.PUMPPORTAL_WS_URL
      ? "pumpportal"
      : "solana-rpc";
  }

  private connectionUrl(source: NewTokenSource) {
    if (source === "solana-rpc") return solanaWsUrl();
    if (source === "dexscreener-profile")
      return process.env.DEXSCREENER_PROFILE_WS_URL ?? DEFAULT_DEX_WS;
    const custom = process.env.PUMPPORTAL_WS_URL;
    if (custom) return custom;
    const apiKey = process.env.PUMPPORTAL_API_KEY;
    if (!apiKey)
      throw new Error(
        "PUMPPORTAL_API_KEY is required when NEW_TOKEN_STREAM_SOURCE=pumpportal",
      );
    return `${DEFAULT_PUMP_WS}?api-key=${encodeURIComponent(apiKey)}`;
  }

  private configureProfilePoller() {
    if (this.source !== "dexscreener-profile") {
      if (this.profilePollTimer) clearInterval(this.profilePollTimer);
      this.profilePollTimer = null;
      this.dexPollHealthy = false;
      return;
    }
    if (this.profilePollTimer) return;
    void this.pollDexProfiles();
    this.profilePollTimer = setInterval(
      () => void this.pollDexProfiles(),
      profilePollMs(),
    );
  }

  private async pollDexProfiles() {
    if (this.profilePollBusy || this.source !== "dexscreener-profile") return;
    this.profilePollBusy = true;
    try {
      const payload = await fetchDexJson("token-profiles/latest/v1");
      this.handleDexProfiles(payload);
      const firstSuccess = !this.dexPollHealthy;
      this.dexPollHealthy = true;
      if (firstSuccess || this.status.state !== "connected") {
        this.setStatus({
          state: "connected",
          source: "dexscreener-profile",
          label: streamSourceLabel("dexscreener-profile"),
          message:
            this.websocket?.readyState === WebSocket.OPEN
              ? "Receiving live profiles with REST catch-up"
              : "Receiving profiles through REST catch-up",
          connectedAt: this.status.connectedAt ?? Date.now(),
          retryAt: null,
        });
      }
    } catch {
      if (
        !this.dexPollHealthy &&
        this.websocket?.readyState !== WebSocket.OPEN
      ) {
        this.setStatus({
          state: "reconnecting",
          source: "dexscreener-profile",
          label: streamSourceLabel("dexscreener-profile"),
          message: "Waiting for DEX Screener profile data",
        });
      }
    } finally {
      this.profilePollBusy = false;
    }
  }

  private connect() {
    if (
      this.websocket &&
      (this.websocket.readyState === WebSocket.OPEN ||
        this.websocket.readyState === WebSocket.CONNECTING)
    )
      return;

    this.source = this.configuredSource();
    this.configureProfilePoller();
    const label = streamSourceLabel(this.source);
    if (!this.dexPollHealthy) {
      this.setStatus({
        state: this.reconnectAttempt ? "reconnecting" : "connecting",
        source: this.source,
        label,
        message: `Connecting to ${label}`,
        retryAt: null,
      });
    }

    let url: string;
    try {
      url = this.connectionUrl(this.source);
    } catch (error) {
      this.setStatus({
        state: "error",
        message:
          error instanceof Error ? error.message : "Stream configuration error",
      });
      return;
    }

    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.websocket = socket;

    socket.addEventListener("open", () => {
      this.reconnectAttempt = 0;
      const connectedAt = Date.now();
      if (this.source === "pumpportal") {
        socket.send(JSON.stringify({ method: "subscribeNewToken" }));
        this.setStatus({
          state: "connected",
          source: this.source,
          label: streamSourceLabel(this.source),
          message: "Receiving Pump/PumpSwap creation events",
          connectedAt,
          retryAt: null,
        });
      } else if (this.source === "solana-rpc") {
        socket.send(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "logsSubscribe",
            params: [
              { mentions: [PUMP_PROGRAM_ID] },
              { commitment: "confirmed" },
            ],
          }),
        );
        this.setStatus({
          state: "connecting",
          source: this.source,
          label: streamSourceLabel(this.source),
          message: "Subscribing to Pump program logs",
          connectedAt,
          retryAt: null,
        });
      } else {
        this.setStatus({
          state: "connected",
          source: this.source,
          label: streamSourceLabel(this.source),
          message: "Receiving live profiles with REST catch-up",
          connectedAt,
          retryAt: null,
        });
      }
    });

    socket.addEventListener(
      "message",
      (event) => void this.handleMessage(event.data),
    );

    socket.addEventListener("error", () => {
      if (this.source === "dexscreener-profile" && this.dexPollHealthy) {
        this.setStatus({
          state: "connected",
          message: "REST catch-up active while the profile socket reconnects",
        });
      } else {
        this.setStatus({
          state: "reconnecting",
          message: `${streamSourceLabel(this.source)} connection error`,
        });
      }
    });

    socket.addEventListener("close", () => {
      if (this.websocket === socket) this.websocket = null;
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(delay?: number) {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const wait =
      delay ??
      Math.min(30_000, 1_000 * 2 ** Math.min(this.reconnectAttempt++, 5));
    const retryAt = Date.now() + wait;
    if (this.source === "dexscreener-profile" && this.dexPollHealthy) {
      this.setStatus({
        state: "connected",
        message:
          "Profile REST catch-up active; live socket reconnect scheduled",
        retryAt,
      });
    } else {
      this.setStatus({
        state: "reconnecting",
        message: `Reconnecting to ${streamSourceLabel(this.source)}`,
        retryAt,
      });
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, wait);
  }

  private async parseData(data: unknown) {
    if (typeof data === "string") return JSON.parse(data);
    if (data instanceof Blob) return JSON.parse(await data.text());
    if (data instanceof ArrayBuffer)
      return JSON.parse(new TextDecoder().decode(data));
    if (ArrayBuffer.isView(data))
      return JSON.parse(new TextDecoder().decode(data));
    return data;
  }

  private async handleMessage(data: unknown) {
    let payload: any;
    try {
      payload = await this.parseData(data);
    } catch {
      return;
    }
    if (this.source === "pumpportal") this.handlePumpPortal(payload);
    else if (this.source === "solana-rpc") this.handleSolanaRpc(payload);
    else this.handleDexProfiles(payload);
  }

  private handlePumpPortal(raw: any) {
    const mint = text(raw?.mint ?? raw?.tokenAddress ?? raw?.address);
    if (!mint) return;
    const observedAt = Date.now();
    this.ingest({
      id: idFor("pumpportal", mint),
      source: "pumpportal",
      mint,
      name: text(raw?.name, "Unnamed token"),
      symbol: text(raw?.symbol, "NEW").slice(0, 24),
      description: nullableText(raw?.description),
      uri: nullableText(raw?.uri ?? raw?.metadataUri),
      imageUrl: nullableText(raw?.image ?? raw?.imageUrl),
      observedAt,
      createdAt: timestamp(raw?.timestamp ?? raw?.createdAt) ?? observedAt,
      creator: nullableText(raw?.traderPublicKey ?? raw?.creator ?? raw?.user),
      signature: nullableText(raw?.signature ?? raw?.txSignature),
      initialBuySol: nullableNumber(
        raw?.initialBuy ?? raw?.initialBuySol ?? raw?.solAmount,
      ),
      marketCapSol: nullableNumber(raw?.marketCapSol),
      dex: null,
      indexedAt: null,
    });
  }

  private handleSolanaRpc(payload: any) {
    if (payload?.id === 1 && typeof payload?.result === "number") {
      this.setStatus({
        state: "connected",
        source: "solana-rpc",
        label: streamSourceLabel("solana-rpc"),
        message: "Receiving confirmed Pump creation logs",
        connectedAt: this.status.connectedAt ?? Date.now(),
        retryAt: null,
      });
      return;
    }
    if (payload?.method !== "logsNotification") return;
    const value = payload?.params?.result?.value;
    if (
      !value ||
      value.err ||
      typeof value.signature !== "string" ||
      !Array.isArray(value.logs)
    )
      return;
    const isCreate = value.logs.some(
      (line: unknown) =>
        typeof line === "string" &&
        /Program log: (Instruction: )?Create(?:V2)?\b/i.test(line),
    );
    if (!isCreate) return;
    this.queueSolanaTransaction(value.signature);
  }

  private queueSolanaTransaction(signature: string) {
    if (this.pendingSignatures.has(signature)) return;
    this.pendingSignatures.add(signature);
    this.rpcQueue.push(signature);
    this.drainRpcQueue();
  }

  private drainRpcQueue() {
    while (this.activeRpcFetches < MAX_RPC_FETCHES && this.rpcQueue.length) {
      const signature = this.rpcQueue.shift();
      if (!signature) continue;
      this.activeRpcFetches += 1;
      void this.resolveSolanaCreate(signature).finally(() => {
        this.pendingSignatures.delete(signature);
        this.activeRpcFetches -= 1;
        this.drainRpcQueue();
      });
    }
  }

  private async getSolanaTransaction(signature: string) {
    for (const delay of TX_RETRY_DELAYS) {
      if (delay) await sleep(delay);
      try {
        const response = await fetch(solanaRpcUrl(), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: signature,
            method: "getTransaction",
            params: [
              signature,
              {
                commitment: "confirmed",
                encoding: "jsonParsed",
                maxSupportedTransactionVersion: 0,
              },
            ],
          }),
          signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok) continue;
        const payload = (await response.json()) as any;
        if (payload?.result) return payload.result;
      } catch {
        // Confirmed logs can arrive before the HTTP node exposes the transaction.
      }
    }
    return null;
  }

  private async resolveSolanaCreate(signature: string) {
    const transaction = await this.getSolanaTransaction(signature);
    if (!transaction || transaction?.meta?.err) return;
    const message = transaction?.transaction?.message;
    const accountKeys = Array.isArray(message?.accountKeys)
      ? message.accountKeys
      : [];
    const instructions = Array.isArray(message?.instructions)
      ? message.instructions
      : [];
    const instruction = instructions.find(
      (candidate: any) =>
        instructionProgramId(candidate, accountKeys) === PUMP_PROGRAM_ID,
    );
    const accounts = instruction
      ? instructionAccounts(instruction, accountKeys)
      : [];
    const preMints = new Set(
      (transaction?.meta?.preTokenBalances ?? [])
        .map((balance: any) => text(balance?.mint))
        .filter(Boolean),
    );
    const createdMint = (transaction?.meta?.postTokenBalances ?? [])
      .map((balance: any) => text(balance?.mint))
      .find((mint: string) => mint && !preMints.has(mint));
    const mint = accounts[0] ?? createdMint;
    if (!mint) return;

    const parsed = parsePumpCreateData(instruction?.data);
    const observedAt = Date.now();
    const creator =
      parsed?.creator ??
      accounts[7] ??
      publicKey(accountKeys.find((key: any) => key?.signer)) ??
      publicKey(accountKeys[0]);
    this.ingest({
      id: idFor("solana-rpc", mint),
      source: "solana-rpc",
      mint,
      name: text(parsed?.name, "New Pump token"),
      symbol: text(parsed?.symbol, "NEW").slice(0, 24),
      description: null,
      uri: nullableText(parsed?.uri),
      imageUrl: null,
      observedAt,
      createdAt: timestamp(transaction?.blockTime) ?? observedAt,
      creator,
      signature,
      initialBuySol: null,
      marketCapSol: null,
      dex: null,
      indexedAt: null,
    });
  }

  private handleDexProfiles(payload: any) {
    const profiles = asArray<Record<string, any>>(payload?.data ?? payload);
    for (const profile of profiles.slice().reverse()) {
      if (profile?.chainId !== "solana") continue;
      const mint = text(profile?.tokenAddress);
      if (!mint) continue;
      const observedAt = Date.now();
      this.ingest({
        id: idFor("dexscreener-profile", mint),
        source: "dexscreener-profile",
        mint,
        name: "Newly profiled token",
        symbol: "NEW",
        description: nullableText(profile?.description),
        uri: nullableText(profile?.url),
        imageUrl: nullableText(profile?.icon ?? profile?.header),
        observedAt,
        createdAt: null,
        creator: null,
        signature: null,
        initialBuySol: null,
        marketCapSol: null,
        dex: null,
        indexedAt: null,
      });
    }
  }

  private ingest(incoming: NewTokenItem) {
    const existing = this.byMint.get(incoming.mint);
    if (existing) {
      const merged: NewTokenItem = {
        ...existing,
        name:
          incoming.name === "Newly profiled token" ||
          incoming.name === "Unnamed token" ||
          incoming.name === "New Pump token"
            ? existing.name
            : incoming.name,
        symbol: incoming.symbol === "NEW" ? existing.symbol : incoming.symbol,
        description: incoming.description ?? existing.description,
        uri: incoming.uri ?? existing.uri,
        imageUrl: incoming.imageUrl ?? existing.imageUrl,
        creator: incoming.creator ?? existing.creator,
        signature: incoming.signature ?? existing.signature,
        initialBuySol: incoming.initialBuySol ?? existing.initialBuySol,
        marketCapSol: incoming.marketCapSol ?? existing.marketCapSol,
      };
      const changed =
        merged.name !== existing.name ||
        merged.symbol !== existing.symbol ||
        merged.description !== existing.description ||
        merged.uri !== existing.uri ||
        merged.imageUrl !== existing.imageUrl ||
        merged.creator !== existing.creator ||
        merged.signature !== existing.signature ||
        merged.initialBuySol !== existing.initialBuySol ||
        merged.marketCapSol !== existing.marketCapSol;
      if (!changed) return;
      this.byMint.set(incoming.mint, merged);
      const index = this.tokens.findIndex(
        (token) => token.mint === incoming.mint,
      );
      if (index >= 0) this.tokens[index] = merged;
      this.publish({ type: "update", token: merged });
      return;
    }

    if (this.seen.has(incoming.mint)) return;
    this.seen.add(incoming.mint);
    if (this.seen.size > MAX_SEEN)
      this.seen = new Set(this.tokens.map((token) => token.mint));
    this.tokens.unshift(incoming);
    this.byMint.set(incoming.mint, incoming);
    while (this.tokens.length > MAX_BUFFER) {
      const removed = this.tokens.pop();
      if (removed) this.byMint.delete(removed.mint);
    }
    this.publish({ type: "token", token: incoming });
    this.enrichments.set(incoming.mint, { attempt: 0, dueAt: Date.now() });
  }

  private async flushEnrichment() {
    const now = Date.now();
    const due = [...this.enrichments.entries()]
      .filter(([, job]) => job.dueAt <= now)
      .slice(0, 30);
    if (!due.length) return;
    due.forEach(([mint]) => this.enrichments.delete(mint));
    try {
      const markets = await bestDexPairsByToken(due.map(([mint]) => mint));
      for (const [mint, job] of due) {
        const token = this.byMint.get(mint);
        if (!token) continue;
        const dex = markets.get(mint) ?? null;
        if (dex) {
          const updated: NewTokenItem = {
            ...token,
            name: [
              "Newly profiled token",
              "Unnamed token",
              "New Pump token",
            ].includes(token.name)
              ? dex.baseToken.name
              : token.name,
            symbol:
              token.symbol === "NEW" ? dex.baseToken.symbol : token.symbol,
            imageUrl: token.imageUrl ?? dex.imageUrl,
            dex,
            indexedAt: Date.now(),
          };
          this.byMint.set(mint, updated);
          const index = this.tokens.findIndex((item) => item.mint === mint);
          if (index >= 0) this.tokens[index] = updated;
          this.publish({ type: "update", token: updated });
        } else if (job.attempt + 1 < ENRICH_DELAYS.length) {
          const nextAttempt = job.attempt + 1;
          this.enrichments.set(mint, {
            attempt: nextAttempt,
            dueAt: Date.now() + ENRICH_DELAYS[nextAttempt],
          });
        }
      }
    } catch {
      for (const [mint, job] of due) {
        if (job.attempt + 1 < ENRICH_DELAYS.length) {
          const nextAttempt = job.attempt + 1;
          this.enrichments.set(mint, {
            attempt: nextAttempt,
            dueAt: Date.now() + ENRICH_DELAYS[nextAttempt],
          });
        }
      }
    }
  }
}

declare global {
  var __solardTokenStreamManager: TokenStreamManager | undefined;
}

export const tokenStreamManager =
  globalThis.__solardTokenStreamManager ?? new TokenStreamManager();
globalThis.__solardTokenStreamManager = tokenStreamManager;
tokenStreamManager.ensureStarted();
