import type { PublicKey } from "@solana/web3.js";
import {
  SolardClient,
  humanizeChainError,
  projectedPositionMetrics,
} from "./chain";
import { traceLabel } from "./observability/action";
import { clientMeasure, clientSessionId } from "./observability/client";
import { errorRecord } from "./observability/error";
import {
  bigintFromUnknown,
  eventValue,
  formatCompact,
  formatPriceE6,
  formatToken,
  parseTokenAmount,
  shortAddress,
  unixAgo,
} from "./format";
import type {
  ActivityItem,
  FeedFilter,
  FeedSort,
  FeedToken,
  InjectedWallet,
  MarketPosition,
  MarketSnapshot,
  SideName,
  SolardConfig,
  TapeItem,
  ToastItem,
  TokenFeedPayload,
  WalletBalances,
  WalletOption,
  WalletProviderName,
} from "./types";
import {
  beginInjectedWalletConnection,
  discoverWallets,
  publicKeyFromLike,
  rememberWalletPublicKey,
  resetInjectedWalletSession,
  waitForWallets,
  walletDiagnostic,
  walletInstallUrl,
  walletPublicKey,
} from "./wallet";

type RenderFn = (node: any, root: HTMLElement) => unknown;
type SortDirection = 1 | -1;

type State = {
  booting: boolean;
  marketLoading: boolean;
  feedConnected: boolean;
  error: string | null;
  feedWarning: string | null;
  config: SolardConfig | null;
  client: SolardClient | null;
  markets: MarketSnapshot[];
  feedTokens: FeedToken[];
  selectedMint: string | null;
  filter: FeedFilter;
  sortKey: FeedSort;
  sortDirection: SortDirection;
  favorites: Set<string>;
  hidden: Set<string>;
  walletProvider: InjectedWallet | null;
  walletName: WalletProviderName | null;
  wallets: WalletOption[];
  walletModal: boolean;
  walletConnecting: boolean;
  walletError: string | null;
  walletAttemptId: string | null;
  positions: MarketPosition[];
  balances: Record<string, WalletBalances>;
  activity: ActivityItem[];
  side: SideName;
  collateralInput: string;
  leverage: number;
  slippageBps: number;
  txLabel: string | null;
  lastSignature: string | null;
  lastRefresh: number | null;
  tape: TapeItem[];
  searchOpen: boolean;
  searchQuery: string;
  searchIndex: number;
  toasts: ToastItem[];
};

let state = freshState();
let rootElement: HTMLElement | null = null;
let renderFunction: RenderFn | null = null;
let refreshTimer: number | null = null;
let feedPollTimer: number | null = null;
let feedPollAbort: AbortController | null = null;
let feedPollInFlight = false;
let feedPollFailures = 0;
let feedPollSequence = 0;
let feedEtag: string | null = null;
let feedPayloadWarning: string | null = null;
let feedLifecycleBound = false;
let toastSequence = 0;
let refreshSequence = 0;
let marketRefreshInFlight = false;
let lastFeedAt = 0;

const FEED_POLL_VISIBLE_MS = 10_000;
const FEED_POLL_HIDDEN_MS = 45_000;
const FEED_POLL_MAX_BACKOFF_MS = 60_000;
const FEED_REQUEST_TIMEOUT_MS = 8_000;
let walletEventProvider: InjectedWallet | null = null;
let walletDisconnectHandler: ((...args: unknown[]) => void) | null = null;
let walletAccountHandler: ((...args: unknown[]) => void) | null = null;
let walletConnectTask: Promise<void> | null = null;

function freshState(): State {
  return {
    booting: true,
    marketLoading: false,
    feedConnected: false,
    error: null,
    feedWarning: null,
    config: null,
    client: null,
    markets: [],
    feedTokens: [],
    selectedMint: null,
    filter: "all",
    sortKey: "created",
    sortDirection: -1,
    favorites: new Set<string>(),
    hidden: new Set<string>(),
    walletProvider: null,
    walletName: null,
    wallets: [],
    walletModal: false,
    walletConnecting: false,
    walletError: null,
    walletAttemptId: null,
    positions: [],
    balances: {},
    activity: [],
    side: "long",
    collateralInput: "100",
    leverage: 3,
    slippageBps: 100,
    txLabel: null,
    lastSignature: null,
    lastRefresh: null,
    tape: [],
    searchOpen: false,
    searchQuery: "",
    searchIndex: 0,
    toasts: [],
  };
}

function draw() {
  if (!rootElement || !renderFunction) return;
  renderFunction(<SolardApp />, rootElement);
}

function toast(message: string, tone: ToastItem["tone"] = "default") {
  const id = ++toastSequence;
  state.toasts = [...state.toasts, { id, message, tone }];
  draw();
  window.setTimeout(() => {
    state.toasts = state.toasts.filter((item) => item.id !== id);
    draw();
  }, 3_800);
}

function marketId(market: MarketSnapshot): string {
  return market.address.toBase58();
}

function stableLike(symbol: string): boolean {
  return /USD|USDC|USDT|PYUSD|COLLATERAL/i.test(symbol);
}

function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "$—";
  const negative = value < 0;
  const amount = Math.abs(value);
  const prefix = negative ? "−$" : "$";
  if (amount >= 1_000_000_000)
    return `${prefix}${(amount / 1_000_000_000).toFixed(2)}B`;
  if (amount >= 1_000_000)
    return `${prefix}${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 10_000) return `${prefix}${(amount / 1_000).toFixed(1)}K`;
  return `${prefix}${amount.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: amount < 10 ? 2 : 0 })}`;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const amount = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (amount >= 1_000_000_000)
    return `${sign}${(amount / 1_000_000_000).toFixed(2)}B`;
  if (amount >= 1_000_000) return `${sign}${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `${sign}${(amount / 1_000).toFixed(1)}K`;
  return `${sign}${amount.toFixed(amount < 1 ? 4 : 2)}`;
}

function formatExternalPrice(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "$—";
  if (value >= 1_000)
    return `$${value.toLocaleString("en-US", { maximumFractionDigits: 1 })}`;
  if (value >= 1) return `$${value.toFixed(3)}`;
  const decimals = Math.min(10, Math.ceil(-Math.log10(value)) + 3);
  return `$${value.toFixed(decimals)}`;
}

function formatAge(timestamp: number): string {
  if (!timestamp) return "—";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1_000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

function rawToNumber(raw: bigint, decimals: number): number {
  return Number(raw) / 10 ** decimals;
}

function formatCollateral(
  raw: bigint,
  market: MarketSnapshot,
  compact = false,
): string {
  const symbol = state.config?.collateralSymbol || "COLLATERAL";
  if (stableLike(symbol)) {
    const value = rawToNumber(raw, market.collateralDecimals);
    return compact
      ? formatUsd(value)
      : `$${formatToken(raw, market.collateralDecimals, 4)}`;
  }
  return `${compact ? formatCompact(raw, market.collateralDecimals) : formatToken(raw, market.collateralDecimals, 4)} ${symbol}`;
}

function configuredMarket(): MarketSnapshot | null {
  if (!state.config) return null;
  return (
    state.markets.find(
      (market) => market.address.toBase58() === state.config?.marketAddress,
    ) || null
  );
}

function marketForMint(mint: string | null): MarketSnapshot | null {
  if (!mint) return null;
  return (
    state.markets.find((market) => market.baseMint.toBase58() === mint) || null
  );
}

function positionForMarket(
  market: MarketSnapshot | null,
): MarketPosition | null {
  if (!market) return null;
  return (
    state.positions.find((item) =>
      item.market.address.equals(market.address),
    ) || null
  );
}

function balanceForMarket(market: MarketSnapshot | null): WalletBalances {
  if (!market) return { raw: 0n, ata: null };
  return state.balances[marketId(market)] || { raw: 0n, ata: null };
}

function defaultMarketToken(market: MarketSnapshot): FeedToken {
  const isConfigured =
    state.config?.marketAddress === market.address.toBase58();
  const symbol = isConfigured
    ? state.config?.marketSymbol || "SOLARD"
    : `PERP${market.marketIndex.toString()}`;
  const mark = Number(market.poolPriceE6 || market.storedPriceE6) / 1_000_000;
  return {
    mint: market.baseMint.toBase58(),
    pairAddress: market.pumpswapPool.toBase58(),
    symbol,
    name: `${symbol} perpetual market`,
    imageUrl: null,
    dexId: "pumpswap",
    quoteSymbol: state.config?.collateralSymbol || "COLLATERAL",
    url: null,
    priceUsd: stableLike(state.config?.collateralSymbol || "") ? mark : 0,
    priceNative: mark,
    marketCap: 0,
    fdv: 0,
    liquidityUsd: stableLike(state.config?.collateralSymbol || "")
      ? rawToNumber(market.vaultBalance, market.collateralDecimals)
      : 0,
    volumeM5: 0,
    volumeH1: 0,
    priceChangeM5: 0,
    buysM5: 0,
    sellsM5: 0,
    pairCreatedAt: 0,
    newPair: false,
    migrated: true,
    activePerp: true,
    marketAddress: market.address.toBase58(),
    maxLeverage: Math.min(25, market.maxLeverageBps / 10_000),
    paused: market.paused,
    settlementMode: market.settlementMode,
    source: "onchain",
  };
}

function mergedTokens(): FeedToken[] {
  const map = new Map<string, FeedToken>();
  for (const token of state.feedTokens) {
    if (!state.hidden.has(token.mint)) map.set(token.mint, { ...token });
  }
  for (const market of state.markets) {
    const mint = market.baseMint.toBase58();
    const fallback = defaultMarketToken(market);
    const existing = map.get(mint);
    const isConfigured =
      state.config?.marketAddress === market.address.toBase58();
    const mark = Number(market.poolPriceE6 || market.storedPriceE6) / 1_000_000;
    map.set(mint, {
      ...(existing || fallback),
      mint,
      symbol: isConfigured
        ? state.config?.marketSymbol || fallback.symbol
        : existing?.symbol || fallback.symbol,
      name: isConfigured
        ? `${state.config?.marketSymbol || fallback.symbol} perpetual`
        : existing?.name || fallback.name,
      pairAddress: existing?.pairAddress || market.pumpswapPool.toBase58(),
      dexId: existing?.dexId || "pumpswap",
      quoteSymbol:
        existing?.quoteSymbol || state.config?.collateralSymbol || "COLLATERAL",
      priceNative: mark,
      priceUsd:
        existing?.priceUsd ||
        (stableLike(state.config?.collateralSymbol || "") ? mark : 0),
      migrated: true,
      activePerp: true,
      marketAddress: market.address.toBase58(),
      maxLeverage: Math.min(25, market.maxLeverageBps / 10_000),
      paused: market.paused,
      settlementMode: market.settlementMode,
      source: existing?.source || "onchain",
    });
  }
  return [...map.values()];
}

function filterTokens(): FeedToken[] {
  const tokens = mergedTokens().filter((token) => {
    if (state.filter === "new") return token.newPair;
    if (state.filter === "migrated") return token.migrated;
    if (state.filter === "active") return token.activePerp;
    return true;
  });

  const direction = state.sortDirection;
  const value = (token: FeedToken): number => {
    if (state.sortKey === "marketCap") return token.marketCap || token.fdv;
    if (state.sortKey === "volume") return token.volumeM5 || token.volumeH1;
    if (state.sortKey === "leverage") return token.maxLeverage;
    return token.pairCreatedAt;
  };

  return tokens.sort((a, b) => {
    const aFav = state.favorites.has(a.mint) ? 1 : 0;
    const bFav = state.favorites.has(b.mint) ? 1 : 0;
    if (aFav !== bFav) return bFav - aFav;
    const delta = value(a) - value(b);
    if (delta !== 0) return delta * direction;
    return a.symbol.localeCompare(b.symbol);
  });
}

function selectedToken(): FeedToken | null {
  const tokens = mergedTokens();
  return (
    tokens.find((token) => token.mint === state.selectedMint) ||
    tokens[0] ||
    null
  );
}

function ensureSelection() {
  const tokens = mergedTokens();
  if (
    state.selectedMint &&
    tokens.some((token) => token.mint === state.selectedMint)
  )
    return;
  const configured = configuredMarket();
  state.selectedMint =
    configured?.baseMint.toBase58() ||
    tokens.find((token) => token.activePerp)?.mint ||
    tokens[0]?.mint ||
    null;
}

async function loadConfig(): Promise<SolardConfig> {
  const config = await clientMeasure(
    traceLabel("Load app config"),
    async () => {
      const response = await fetch("/api/config", { cache: "no-store" });
      if (!response.ok)
        throw new Error(`Config endpoint returned ${response.status}.`);
      const value = (await response.json()) as SolardConfig;
      clientMeasure.note(
        traceLabel("App config loaded", {
          cluster: value.cluster,
          programId: value.programId,
        }),
      );
      return value;
    },
  );
  if (!config) throw new Error("Unable to load the SOLARD configuration.");
  return config;
}

function applyFeed(payload: TokenFeedPayload) {
  const previous = new Map(
    state.feedTokens.map((token) => [token.mint, token]),
  );
  const additions: TapeItem[] = [];
  for (const token of payload.tokens) {
    const old = previous.get(token.mint);
    let direction: 1 | -1 = token.priceChangeM5 >= 0 ? 1 : -1;
    if (
      old &&
      token.priceUsd &&
      old.priceUsd &&
      token.priceUsd !== old.priceUsd
    ) {
      direction = token.priceUsd > old.priceUsd ? 1 : -1;
    }
    if (!old || token.priceUsd !== old.priceUsd) {
      additions.push({
        mint: token.mint,
        symbol: token.symbol,
        direction,
        value: token.volumeM5 || token.priceUsd || token.priceNative,
        time: Date.now(),
      });
    }
  }
  if (state.tape.length === 0 && additions.length === 0) {
    for (const token of payload.tokens.slice(0, 12)) {
      additions.push({
        mint: token.mint,
        symbol: token.symbol,
        direction: token.priceChangeM5 >= 0 ? 1 : -1,
        value: token.volumeM5 || token.priceUsd || token.priceNative,
        time: Date.now(),
      });
    }
  }
  state.tape = [...additions.reverse(), ...state.tape].slice(0, 30);
  state.feedTokens = payload.tokens;
  feedPayloadWarning = payload.warning || null;
  state.feedWarning = feedPayloadWarning;
  state.feedConnected = true;
  lastFeedAt = Date.now();
  ensureSelection();
  draw();
}

function clearFeedPollTimer() {
  if (feedPollTimer !== null) window.clearTimeout(feedPollTimer);
  feedPollTimer = null;
}

function normalFeedPollInterval(): number {
  return document.visibilityState === "hidden"
    ? FEED_POLL_HIDDEN_MS
    : FEED_POLL_VISIBLE_MS;
}

function nextFeedPollInterval(serverHintMs = 0): number {
  const normal = Math.max(normalFeedPollInterval(), serverHintMs);
  if (feedPollFailures === 0) return normal;
  return Math.min(
    FEED_POLL_MAX_BACKOFF_MS,
    normal * 2 ** Math.min(feedPollFailures, 3),
  );
}

function scheduleFeedPoll(delayMs: number, reason: string) {
  clearFeedPollTimer();
  if (!rootElement) return;
  const delay = Math.max(250, Math.round(delayMs));
  clientMeasure.note(
    traceLabel("Schedule token feed poll", {
      reason,
      delayMs: delay,
      failures: feedPollFailures,
      visibility: document.visibilityState,
    }),
  );
  feedPollTimer = window.setTimeout(() => {
    feedPollTimer = null;
    void pollTokenFeed(`scheduled:${reason}`).catch(() => undefined);
  }, delay);
}

type FeedPollResult = {
  payload: TokenFeedPayload | null;
  notModified: boolean;
  pollAfterMs: number;
  etag: string | null;
  status: number;
  degraded: boolean;
  error: string | null;
  build: string | null;
};

async function requestTokenSnapshot(
  reason: string,
  sequence: number,
): Promise<FeedPollResult | null> {
  feedPollAbort?.abort();
  const controller = new AbortController();
  feedPollAbort = controller;
  const timeout = window.setTimeout(
    () => controller.abort(),
    FEED_REQUEST_TIMEOUT_MS,
  );

  try {
    return await clientMeasure(
      traceLabel("GET /api/tokens", {
        reason,
        sequence,
        etag: feedEtag,
        timeoutMs: FEED_REQUEST_TIMEOUT_MS,
      }),
      async () => {
        try {
          const headers = new Headers({ Accept: "application/json" });
          if (feedEtag) headers.set("If-None-Match", feedEtag);
          const response = await fetch("/api/tokens", {
            cache: "no-store",
            headers,
            signal: controller.signal,
          });
          const pollAfterMs = Number(
            response.headers.get("x-poll-after-ms") || 0,
          );
          const etag = response.headers.get("etag");
          const build = response.headers.get("x-solard-build");
          const degraded = response.headers.get("x-feed-degraded") === "1";
          const base = {
            pollAfterMs: Number.isFinite(pollAfterMs) ? pollAfterMs : 0,
            etag,
            build,
            degraded,
          };
          if (response.status === 304) {
            return {
              ...base,
              payload: null,
              notModified: true,
              status: 304,
              error: null,
            };
          }
          if (!response.ok) {
            let detail = "";
            try {
              const body = (await response.json()) as { error?: string };
              detail = body?.error ? ` ${body.error}` : "";
            } catch {
              detail = "";
            }
            return {
              ...base,
              payload: null,
              notModified: false,
              status: response.status,
              degraded: true,
              error: `Token polling endpoint returned ${response.status}.${detail}`,
            };
          }
          const payload = (await response.json()) as TokenFeedPayload;
          if (!payload || !Array.isArray(payload.tokens)) {
            return {
              ...base,
              payload: null,
              notModified: false,
              status: response.status,
              degraded: true,
              error: "Token polling endpoint returned an invalid payload.",
            };
          }
          clientMeasure.note(
            traceLabel("Token snapshot received", {
              status: response.status,
              tokens: payload.tokens.length,
              degraded,
              build,
            }),
          );
          return {
            ...base,
            payload,
            notModified: false,
            status: response.status,
            error: null,
          };
        } catch (error) {
          if (controller.signal.aborted && !rootElement) return null;
          const detail = errorRecord(error);
          return {
            payload: null,
            notModified: false,
            pollAfterMs: 0,
            etag: null,
            status: 0,
            degraded: true,
            error: controller.signal.aborted
              ? "Token polling request timed out."
              : `Token polling request failed: ${detail.message}`,
            build: null,
          };
        }
      },
    );
  } catch (error) {
    return {
      payload: null,
      notModified: false,
      pollAfterMs: 0,
      etag: null,
      status: 0,
      degraded: true,
      error: `Token polling measurement failed: ${errorRecord(error).message}`,
      build: null,
    };
  } finally {
    window.clearTimeout(timeout);
    if (feedPollAbort === controller) feedPollAbort = null;
  }
}

async function pollTokenFeed(reason: string) {
  if (!rootElement) return;
  if (feedPollInFlight) {
    clientMeasure.note(
      traceLabel("Skip overlapping token feed poll", {
        reason,
        activeSequence: feedPollSequence,
      }),
    );
    scheduleFeedPoll(1_000, "overlap");
    return;
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    state.feedConnected = false;
    state.feedWarning =
      "Browser is offline. Token polling will resume when the connection returns.";
    draw();
    scheduleFeedPoll(nextFeedPollInterval(), "offline");
    return;
  }

  feedPollInFlight = true;
  const sequence = ++feedPollSequence;
  let serverHintMs = 0;
  try {
    await clientMeasure.root(
      traceLabel("Poll token feed snapshot", {
        reason,
        sequence,
        visibility: document.visibilityState,
        failures: feedPollFailures,
      }),
      async () => {
        const result = await requestTokenSnapshot(reason, sequence);
        if (!result) return;
        serverHintMs = result.pollAfterMs;
        if (result.etag) feedEtag = result.etag;
        if (result.error) {
          feedPollFailures += 1;
          state.feedConnected = state.feedTokens.length > 0;
          state.feedWarning = result.error;
          draw();
          return;
        }
        if (result.payload) {
          const preserveStale =
            result.degraded &&
            result.payload.tokens.length === 0 &&
            state.feedTokens.length > 0;
          if (!preserveStale) applyFeed(result.payload);
          else {
            feedPayloadWarning =
              result.payload.warning ||
              "Token discovery is temporarily unavailable.";
            state.feedWarning = feedPayloadWarning;
            draw();
          }
        } else {
          state.feedWarning = feedPayloadWarning;
          lastFeedAt = Date.now();
          draw();
        }
        if (result.degraded) {
          feedPollFailures += 1;
          state.feedConnected = state.feedTokens.length > 0;
          state.feedWarning =
            result.payload?.warning ||
            state.feedWarning ||
            "Token discovery is temporarily unavailable.";
        } else {
          feedPollFailures = 0;
          state.feedConnected = true;
          lastFeedAt = Date.now();
        }
        clientMeasure.note(
          traceLabel("Token feed poll complete", {
            changed: Boolean(result.payload),
            tokens: result.payload?.tokens.length ?? state.feedTokens.length,
            failures: feedPollFailures,
          }),
        );
        draw();
      },
    );
  } catch (error) {
    if (rootElement) {
      feedPollFailures += 1;
      state.feedConnected = false;
      state.feedWarning = humanizeChainError(error);
      draw();
    }
  } finally {
    feedPollInFlight = false;
    if (rootElement)
      scheduleFeedPoll(
        nextFeedPollInterval(serverHintMs),
        feedPollFailures ? "retry" : "success",
      );
  }
}

function onFeedVisibilityChange() {
  clientMeasure.note(
    traceLabel("Token poll visibility changed", {
      visibility: document.visibilityState,
      lastSuccessAgeMs: lastFeedAt ? Date.now() - lastFeedAt : null,
    }),
  );
  clearFeedPollTimer();
  if (document.visibilityState === "visible")
    void pollTokenFeed("tab-visible").catch(() => undefined);
  else scheduleFeedPoll(FEED_POLL_HIDDEN_MS, "tab-hidden");
}

function onFeedOnline() {
  clientMeasure.note("Browser online; resume token polling");
  clearFeedPollTimer();
  void pollTokenFeed("online").catch(() => undefined);
}

function onFeedOffline() {
  clientMeasure.note("Browser offline; pause token polling");
  state.feedConnected = false;
  state.feedWarning =
    "Browser is offline. Token polling will resume automatically.";
  draw();
  clearFeedPollTimer();
}

function bindFeedPollingLifecycle() {
  if (feedLifecycleBound) return;
  feedLifecycleBound = true;
  document.addEventListener("visibilitychange", onFeedVisibilityChange);
  window.addEventListener("online", onFeedOnline);
  window.addEventListener("offline", onFeedOffline);
  clientMeasure.note(
    traceLabel("Token polling lifecycle ready", {
      visibleIntervalMs: FEED_POLL_VISIBLE_MS,
      hiddenIntervalMs: FEED_POLL_HIDDEN_MS,
    }),
  );
}

function unbindFeedPollingLifecycle() {
  if (!feedLifecycleBound) return;
  document.removeEventListener("visibilitychange", onFeedVisibilityChange);
  window.removeEventListener("online", onFeedOnline);
  window.removeEventListener("offline", onFeedOffline);
  feedLifecycleBound = false;
}

async function refreshMarkets(includeActivity = false) {
  if (!state.client || marketRefreshInFlight) return;
  marketRefreshInFlight = true;
  state.marketLoading = true;
  draw();
  try {
    await clientMeasure(
      traceLabel("Refresh on-chain markets", {
        includeActivity,
        wallet: state.client.walletPublicKey?.toBase58() || null,
      }),
      async () => {
        const markets = await state.client!.fetchMarkets();
        state.markets = markets;
        state.error = null;
        state.lastRefresh = Date.now();
        const configured = configuredMarket();
        if (configured) state.favorites.add(configured.baseMint.toBase58());
        ensureSelection();

        const owner = state.client!.walletPublicKey;
        if (owner) {
          state.positions = await state.client!.fetchWalletPositions(
            owner,
            markets,
          );
          const selectedMarket = marketForMint(state.selectedMint);
          if (selectedMarket) {
            const balance = await state.client!.fetchWalletBalance(
              owner,
              selectedMarket,
            );
            state.balances = {
              ...state.balances,
              [marketId(selectedMarket)]: balance,
            };
          }
        } else {
          state.positions = [];
          state.balances = {};
        }

        refreshSequence += 1;
        const selectedMarket = marketForMint(state.selectedMint);
        if (selectedMarket && (includeActivity || refreshSequence % 3 === 1)) {
          state.activity = await state.client!.fetchActivity(
            selectedMarket.address,
            18,
          );
        }
        clientMeasure.note(
          traceLabel("On-chain markets refreshed", {
            markets: markets.length,
            positions: state.positions.length,
          }),
        );
      },
    );
  } catch (error) {
    state.error = humanizeChainError(error);
  } finally {
    state.marketLoading = false;
    marketRefreshInFlight = false;
    draw();
  }
}

async function bootstrap() {
  try {
    await clientMeasure.root(
      traceLabel("Bootstrap SOLARD terminal", {
        sessionId: clientSessionId,
        origin: window.location.origin,
        secureContext: window.isSecureContext,
      }),
      async () => {
        state.config = await loadConfig();
        state.wallets = discoverWallets();
        clientMeasure.note(
          traceLabel("Wallet providers discovered", {
            count: state.wallets.length,
            providers: state.wallets.map((item) => item.name),
          }),
        );
        state.client = new SolardClient(state.config);
        state.booting = false;
        draw();
        bindFeedPollingLifecycle();
        await Promise.all([refreshMarkets(true), pollTokenFeed("bootstrap")]);
      },
    );
  } catch (error) {
    state.booting = false;
    state.error = humanizeChainError(error);
    draw();
  }
}

function unbindWalletEvents() {
  if (walletEventProvider && walletDisconnectHandler) {
    walletEventProvider.off?.("disconnect", walletDisconnectHandler);
  }
  if (walletEventProvider && walletAccountHandler) {
    walletEventProvider.off?.("accountChanged", walletAccountHandler);
  }
  walletEventProvider = null;
  walletDisconnectHandler = null;
  walletAccountHandler = null;
}

function bindWalletEvents(provider: InjectedWallet) {
  unbindWalletEvents();
  walletEventProvider = provider;
  walletDisconnectHandler = () => {
    clientMeasure.note(
      traceLabel("Wallet disconnect event", { wallet: state.walletName }),
    );
    void disconnectWallet(false);
  };
  walletAccountHandler = (value: unknown) => {
    const publicKey = publicKeyFromLike(value as any);
    clientMeasure.note(
      traceLabel("Wallet account changed", {
        publicKey: publicKey?.toBase58() || null,
      }),
    );
    rememberWalletPublicKey(provider, publicKey);
    if (!publicKey) {
      void disconnectWallet(false);
      return;
    }
    state.client = new SolardClient(state.config!, provider);
    void refreshMarkets(true);
  };
  provider.on?.("disconnect", walletDisconnectHandler);
  provider.on?.("accountChanged", walletAccountHandler);
}

function walletFailureText(error: unknown): string {
  const detail = errorRecord(error);
  const cause = detail.cause || detail;
  const code = cause.code ?? detail.code;
  const numericCode = code === undefined ? undefined : Number(code);
  if (numericCode === -32603) {
    return "PHANTOM INTERNAL ERROR (-32603). OPEN AND UNLOCK PHANTOM, RESET THIS SITE SESSION, THEN CONNECT AGAIN.";
  }
  if (numericCode === -32002)
    return "A WALLET CONNECTION REQUEST IS ALREADY PENDING. OPEN THE WALLET EXTENSION.";
  if (numericCode === 4001) return "WALLET CONNECTION WAS REJECTED.";
  return `${state.walletName || "WALLET"}${code !== undefined ? ` ${code}` : ""} · ${cause.message}`.toUpperCase();
}

function walletAttemptFromError(error: unknown): string | null {
  return error && typeof error === "object" && "attemptId" in error
    ? String((error as { attemptId?: unknown }).attemptId || "") || null
    : null;
}

function recordWalletFailure(option: WalletOption, error: unknown) {
  const attempt = walletAttemptFromError(error);
  state.walletAttemptId = attempt;
  state.walletError = walletFailureText(error);
  state.wallets = discoverWallets();
  state.walletModal = true;
  clientMeasure.note(
    traceLabel("Wallet connection failure handled", {
      wallet: option.name,
      code: errorRecord(error).code,
      attemptId: attempt,
    }),
  );
  toast(`${state.walletError}${attempt ? ` · TRACE ${attempt}` : ""}`, "bad");
}

async function finishWalletConnection(
  option: WalletOption,
  connection: ReturnType<typeof beginInjectedWalletConnection>,
): Promise<void> {
  try {
    const diagnostic = walletDiagnostic(option.provider);
    const result = await clientMeasure.root(
      traceLabel("Connect injected wallet", {
        wallet: option.name,
        origin: diagnostic.origin,
        secure: diagnostic.secureContext,
        topLevel: diagnostic.topLevel,
      }),
      () => connection,
    );

    state.walletAttemptId = result.attemptId;
    await clientMeasure(
      traceLabel("Activate connected wallet", {
        wallet: option.name,
        publicKey: result.publicKey.toBase58(),
        attemptId: result.attemptId,
      }),
      async () => {
        if (!state.config) throw new Error("App configuration is not loaded.");
        state.walletProvider = option.provider;
        state.walletName = option.name;
        state.walletModal = false;
        state.walletError = null;
        state.client = new SolardClient(state.config, option.provider);
        bindWalletEvents(option.provider);
        toast(
          `${option.label.toUpperCase()} CONNECTED · ${shortAddress(result.publicKey)}`,
          "violet",
        );
        draw();
        await refreshMarkets(true);
      },
    );
  } catch (error) {
    recordWalletFailure(option, error);
  } finally {
    state.walletConnecting = false;
    walletConnectTask = null;
    draw();
  }
}

function connectWalletFromGesture(option: WalletOption) {
  if (state.walletConnecting || walletConnectTask) {
    toast("A WALLET REQUEST IS ALREADY OPEN", "warn");
    return;
  }
  state.walletName = option.name;
  state.walletError = null;
  state.walletAttemptId = null;

  // Keep the extension call synchronous with the click. No await, render, or
  // measurement happens before Phantom receives the user gesture.
  const connection = beginInjectedWalletConnection(
    option.provider,
    false,
    option.label,
  );
  state.walletConnecting = true;
  draw();
  walletConnectTask = finishWalletConnection(option, connection);
  void walletConnectTask.catch((error) => {
    // finishWalletConnection catches normal provider failures. This guard keeps
    // a future programming error from becoming an unhandled rejection.
    recordWalletFailure(option, error);
    state.walletConnecting = false;
    walletConnectTask = null;
    draw();
  });
}

function openWallet() {
  const wallets = discoverWallets();
  state.wallets = wallets;
  state.walletError = null;
  clientMeasure.note(
    traceLabel("Open wallet chooser", {
      providers: wallets.map((item) => item.name),
      count: wallets.length,
    }),
  );
  if (wallets.length === 1) {
    connectWalletFromGesture(wallets[0]);
    return;
  }
  state.walletModal = true;
  draw();
  void clientMeasure("Wait for injected wallets", () => waitForWallets(1_500))
    .then((refreshed) => {
      state.wallets = refreshed;
      draw();
    })
    .catch((error) => {
      clientMeasure.note(
        traceLabel("Wallet discovery wait failed", {
          message: errorRecord(error).message,
        }),
      );
    });
}

async function resetWalletSession() {
  const option =
    state.wallets.find((wallet) => wallet.name === state.walletName) ||
    state.wallets.find((wallet) => wallet.name === "phantom") ||
    null;
  if (!option || state.walletConnecting) return;
  state.walletConnecting = true;
  draw();
  try {
    await clientMeasure.root(
      traceLabel("Reset injected wallet session", { wallet: option.name }),
      () => resetInjectedWalletSession(option.provider),
    );
    state.walletError = null;
    state.walletAttemptId = null;
    state.walletProvider = null;
    toast(
      `${option.label.toUpperCase()} SESSION RESET · CONNECT AGAIN`,
      "violet",
    );
  } catch (error) {
    state.walletError =
      `RESET FAILED · ${errorRecord(error).message}`.toUpperCase();
    toast(state.walletError, "bad");
  } finally {
    state.walletConnecting = false;
    walletConnectTask = null;
    state.wallets = discoverWallets();
    draw();
  }
}

async function disconnectWallet(callProvider = true) {
  const provider = state.walletProvider;
  unbindWalletEvents();
  try {
    await clientMeasure(
      traceLabel("Disconnect wallet", {
        wallet: state.walletName,
        callProvider,
      }),
      async () => {
        if (callProvider) await provider?.disconnect?.();
      },
    );
  } catch (error) {
    clientMeasure.note(
      traceLabel("Wallet disconnect failed", {
        message: errorRecord(error).message,
      }),
    );
  } finally {
    if (provider) rememberWalletPublicKey(provider, null);
    state.walletProvider = null;
    state.walletName = null;
    state.walletConnecting = false;
    state.walletError = null;
    state.client = state.config ? new SolardClient(state.config) : null;
    state.positions = [];
    state.balances = {};
    toast("WALLET DISCONNECTED", "violet");
    draw();
  }
}

async function runTransaction(label: string, action: () => Promise<string>) {
  if (state.txLabel) return;
  state.txLabel = label;
  state.lastSignature = null;
  draw();
  try {
    const signature = await clientMeasure.root(
      traceLabel(`Transaction: ${label}`, {
        wallet: state.client?.walletPublicKey?.toBase58() || null,
        market: marketForMint(state.selectedMint)?.address.toBase58() || null,
      }),
      action,
    );
    state.lastSignature = signature;
    toast(`${label} CONFIRMED · ${shortAddress(signature, 6, 6)}`, "good");
    await refreshMarkets(true);
  } catch (error) {
    toast(humanizeChainError(error), "bad");
  } finally {
    state.txLabel = null;
    draw();
  }
}

function maxTradeNotional(market: MarketSnapshot, side: SideName): bigint {
  const remainingOi =
    market.maxOpenInterest > market.totalOpenInterest
      ? market.maxOpenInterest - market.totalOpenInterest
      : 0n;
  const skewCap = (market.vaultBalance * 80n) / 100n;
  const signedSkew = market.longOpenInterest - market.shortOpenInterest;
  const skewRoom =
    side === "long" ? skewCap - signedSkew : skewCap + signedSkew;
  return remainingOi < (skewRoom > 0n ? skewRoom : 0n)
    ? remainingOi
    : skewRoom > 0n
      ? skewRoom
      : 0n;
}

async function openPosition() {
  const market = marketForMint(state.selectedMint);
  if (!state.client || !market) {
    toast("THIS TOKEN DOES NOT HAVE AN ACTIVE PERP MARKET", "warn");
    return;
  }
  if (!state.client.walletPublicKey) {
    await openWallet();
    return;
  }
  const existing = positionForMarket(market);
  if (existing) {
    toast("CLOSE THE EXISTING POSITION IN THIS MARKET FIRST", "warn");
    return;
  }
  if (market.paused) {
    toast("THIS MARKET IS PAUSED", "warn");
    return;
  }
  if (market.settlementMode) {
    toast("THIS MARKET IS IN SETTLEMENT MODE", "warn");
    return;
  }

  const balance = balanceForMarket(market);
  if (!balance.ata) {
    toast(
      `NO ${state.config?.collateralSymbol || "COLLATERAL"} TOKEN ACCOUNT WAS FOUND`,
      "warn",
    );
    return;
  }

  try {
    const collateralAmount = parseTokenAmount(
      state.collateralInput,
      market.collateralDecimals,
    );
    if (collateralAmount <= 0n)
      throw new Error("Collateral must be greater than zero.");
    if (collateralAmount > balance.raw)
      throw new Error("Insufficient collateral balance.");
    const maxLeverage = Math.min(25, market.maxLeverageBps / 10_000);
    const leverage = Math.max(1, Math.min(state.leverage, maxLeverage));
    const leverageBps = Math.round(leverage * 10_000);
    const notional = (collateralAmount * BigInt(leverageBps)) / 10_000n;
    if (notional > maxTradeNotional(market, state.side)) {
      throw new Error(
        "This order exceeds the market open-interest or vault-skew limit.",
      );
    }
    const mark = market.poolPriceE6 || market.storedPriceE6;
    const priceLimitE6 =
      state.side === "long"
        ? (mark * BigInt(10_000 + state.slippageBps) + 9_999n) / 10_000n
        : (mark * BigInt(10_000 - state.slippageBps)) / 10_000n;

    await runTransaction(`OPEN ${state.side.toUpperCase()}`, () =>
      state.client!.openPosition({
        market,
        collateralAmount,
        leverageBps,
        side: state.side,
        priceLimitE6,
      }),
    );
  } catch (error) {
    toast(humanizeChainError(error), "bad");
  }
}

async function closePosition(item: MarketPosition) {
  if (!state.client?.walletPublicKey) {
    await openWallet();
    return;
  }
  const metrics = projectedPositionMetrics(item.position, item.market);
  const positiveEquity = metrics.equity > 0n ? metrics.equity : 0n;
  const minPayout =
    (positiveEquity * BigInt(10_000 - state.slippageBps)) / 10_000n;
  await runTransaction("CLOSE POSITION", () =>
    state.client!.closePosition({
      market: item.market,
      position: item.position,
      minPayout,
    }),
  );
}

function setSelectedMint(mint: string) {
  state.selectedMint = mint;
  const market = marketForMint(mint);
  if (market) {
    const maxLeverage = Math.max(
      1,
      Math.min(25, market.maxLeverageBps / 10_000),
    );
    state.leverage = Math.min(state.leverage, maxLeverage);
  }
  state.searchOpen = false;
  state.searchQuery = "";
  draw();
  if (market && state.client?.walletPublicKey) void refreshMarkets(true);
}

function setMaxCollateral() {
  const market = marketForMint(state.selectedMint);
  if (!market) return;
  const balance = balanceForMarket(market);
  const leverageBps = BigInt(Math.max(1, Math.round(state.leverage * 10_000)));
  const notionalCap = maxTradeNotional(market, state.side);
  const capCollateral =
    leverageBps > 0n ? (notionalCap * 10_000n) / leverageBps : 0n;
  const max = balance.raw < capCollateral ? balance.raw : capCollateral;
  state.collateralInput = formatToken(
    max,
    market.collateralDecimals,
    market.collateralDecimals,
  );
  draw();
}

function toggleFavorite(mint: string) {
  if (state.favorites.has(mint)) state.favorites.delete(mint);
  else state.favorites.add(mint);
  draw();
}

function openSearch() {
  state.searchOpen = true;
  state.searchQuery = "";
  state.searchIndex = 0;
  draw();
  window.setTimeout(() => document.getElementById("search-input")?.focus(), 20);
}

function closeSearch() {
  state.searchOpen = false;
  state.searchQuery = "";
  state.searchIndex = 0;
  draw();
}

function searchMatches(): FeedToken[] {
  const query = state.searchQuery.trim().toLowerCase();
  const tokens = mergedTokens();
  if (!query) return tokens.slice(0, 12);
  return tokens
    .filter(
      (token) =>
        token.symbol.toLowerCase().includes(query) ||
        token.name.toLowerCase().includes(query) ||
        token.mint.toLowerCase().includes(query),
    )
    .slice(0, 12);
}

function handleKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    state.searchOpen ? closeSearch() : openSearch();
    return;
  }
  if (event.key === "/" && document.activeElement?.tagName !== "INPUT") {
    event.preventDefault();
    openSearch();
    return;
  }
  if (!state.searchOpen) return;
  const matches = searchMatches();
  if (event.key === "Escape") {
    event.preventDefault();
    closeSearch();
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    state.searchIndex = Math.min(
      state.searchIndex + 1,
      Math.max(0, matches.length - 1),
    );
    draw();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    state.searchIndex = Math.max(0, state.searchIndex - 1);
    draw();
  } else if (event.key === "Enter" && matches[state.searchIndex]) {
    event.preventDefault();
    setSelectedMint(matches[state.searchIndex].mint);
  }
}

function explorerUrl(kind: "account" | "tx", value: string): string {
  if (!state.config) return "#";
  const suffix =
    state.config.cluster === "mainnet-beta" ||
    state.config.cluster === "mainnet"
      ? ""
      : `?cluster=${encodeURIComponent(state.config.cluster)}`;
  return `${state.config.explorerBase}/${kind === "tx" ? "tx" : "account"}/${value}${suffix}`;
}

function Logo() {
  return (
    <svg width="30" height="30" viewBox="0 0 100 100" aria-label="Solard logo">
      <g fill="currentColor">
        <path d="M20 20 H80 L64 38 H4 Z" />
        <path d="M20 41 H80 L64 59 H36 L52 45 H4 Z" opacity=".55" />
        <path d="M20 62 H96 L80 80 H20 Z" />
      </g>
    </svg>
  );
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function PixelAvatar({
  token,
  size = 34,
}: {
  token: FeedToken;
  size?: number;
}) {
  let seed = hashString(token.mint || token.symbol);
  const random = () => {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    return seed / 0xffffffff;
  };
  const cells: any[] = [];
  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 3; x += 1) {
      if (random() > 0.46) {
        const opacity = (0.35 + random() * 0.65).toFixed(2);
        cells.push(
          <rect
            x={String(x * 10)}
            y={String(y * 10)}
            width="10"
            height="10"
            opacity={opacity}
          />,
        );
        if (x < 2)
          cells.push(
            <rect
              x={String((4 - x) * 10)}
              y={String(y * 10)}
              width="10"
              height="10"
              opacity={opacity}
            />,
          );
      }
    }
  }
  return (
    <svg
      viewBox="0 0 50 50"
      width={String(size)}
      height={String(size)}
      aria-hidden="true"
    >
      <rect width="50" height="50" fill="#101317" />
      <g fill="#f2f4f6">{cells}</g>
    </svg>
  );
}

function TokenAvatar({
  token,
  large = false,
}: {
  token: FeedToken;
  large?: boolean;
}) {
  return (
    <div className={`av ${large ? "large" : ""}`}>
      <PixelAvatar token={token} size={large ? 38 : 34} />
    </div>
  );
}

function Topbar() {
  const market = marketForMint(state.selectedMint);
  const position = positionForMarket(market);
  const balance = balanceForMarket(market);
  const metrics =
    position && market
      ? projectedPositionMetrics(position.position, market)
      : null;
  const equity = metrics
    ? balance.raw + (metrics.equity > 0n ? metrics.equity : 0n)
    : balance.raw;
  const wallet = state.client?.walletPublicKey || null;
  return (
    <header className="topbar noselect">
      <div className="brand">
        <Logo />
        <div className="wordmark">
          SOLARD<i>://</i>
        </div>
      </div>
      <div className="acct">
        <div>
          <span className="k">BALANCE</span>
          <span className="v">
            {market && wallet
              ? formatCollateral(balance.raw, market, true)
              : "$—"}
          </span>
        </div>
        <div>
          <span className="k">UNREALIZED</span>
          <span
            className={`v ${metrics && metrics.pnl > 0n ? "pos" : metrics && metrics.pnl < 0n ? "neg" : ""}`}
          >
            {market && metrics
              ? formatCollateral(metrics.pnl, market, true)
              : "$—"}
          </span>
        </div>
        <div>
          <span className="k">EQUITY</span>
          <span className="v">
            {market && wallet ? formatCollateral(equity, market, true) : "$—"}
          </span>
        </div>
      </div>
      <div
        className={`stream-dot ${state.feedConnected ? "live" : ""}`}
        title={
          state.feedConnected
            ? "Token polling healthy"
            : "Token polling retrying"
        }
      />
      <button className="tbtn searchbtn" onClick={openSearch}>
        <span>SEARCH</span>
        <span className="kbd">⌘K</span>
      </button>
      <button
        className={`tbtn walletbtn ${wallet ? "on" : ""}`}
        onClick={() => (wallet ? void disconnectWallet() : void openWallet())}
      >
        <span>
          {wallet
            ? shortAddress(wallet)
            : state.walletConnecting
              ? "CONNECTING…"
              : "CONNECT WALLET"}
        </span>
      </button>
    </header>
  );
}

function TradePanel() {
  const token = selectedToken();
  if (!token) {
    return (
      <aside className="ticket">
        <div className="emptypanel">WAITING FOR LIVE TOKENS</div>
      </aside>
    );
  }
  const market = marketForMint(token.mint);
  const position = positionForMarket(market);
  const balance = balanceForMarket(market);
  const wallet = state.client?.walletPublicKey || null;
  const maxLeverage = market
    ? Math.max(1, Math.min(25, market.maxLeverageBps / 10_000))
    : 25;
  const mark = market ? market.poolPriceE6 || market.storedPriceE6 : 0n;
  let collateral = 0n;
  try {
    if (market)
      collateral = parseTokenAmount(
        state.collateralInput,
        market.collateralDecimals,
      );
  } catch {
    collateral = 0n;
  }
  const leverageBps = BigInt(Math.round(Math.max(1, state.leverage) * 10_000));
  const notional = (collateral * leverageBps) / 10_000n;
  const notionalHuman = market
    ? rawToNumber(notional, market.collateralDecimals)
    : 0;
  const markHuman = Number(mark) / 1_000_000;
  const size = markHuman > 0 ? notionalHuman / markHuman : 0;
  const mmr = market ? market.maintenanceMarginBps / 10_000 : 0;
  const liqMultiplier =
    state.side === "long"
      ? 1 + mmr - 1 / Math.max(state.leverage, 1)
      : 1 - mmr + 1 / Math.max(state.leverage, 1);
  const liq = Math.max(0, markHuman * liqMultiplier);
  const distance =
    markHuman > 0 ? (Math.abs(markHuman - liq) / markHuman) * 100 : 0;
  const maxNotional = market ? maxTradeNotional(market, state.side) : 0n;
  const enabled = Boolean(
    market &&
    !market.paused &&
    !market.settlementMode &&
    !position &&
    !state.txLabel,
  );
  const buttonLabel = !market
    ? "NO PERP MARKET"
    : position
      ? "POSITION ALREADY OPEN"
      : market.paused
        ? "MARKET PAUSED"
        : market.settlementMode
          ? "SETTLEMENT MODE"
          : state.txLabel
            ? state.txLabel
            : !wallet
              ? "CONNECT WALLET TO TRADE"
              : `OPEN ${state.side.toUpperCase()}`;

  return (
    <aside className="ticket">
      <div className="tkhead">
        <TokenAvatar token={token} large />
        <div className="nm">
          <div className="tk">{token.symbol}-PERP</div>
          <div className="sub">
            {shortAddress(token.mint, 4, 4)} · {token.name}
          </div>
        </div>
      </div>
      <div className="bigpx">
        <span className="p">
          {market
            ? `${stableLike(state.config?.collateralSymbol || "") ? "$" : ""}${formatPriceE6(mark, 8)}`
            : formatExternalPrice(token.priceUsd)}
        </span>
        <span className={`c ${token.priceChangeM5 >= 0 ? "pos" : "neg"}`}>
          {token.priceChangeM5 >= 0 ? "+" : ""}
          {token.priceChangeM5.toFixed(2)}%
        </span>
      </div>
      <div className="sidegrp noselect">
        <button
          className={`sidebtn long ${state.side === "long" ? "on" : ""}`}
          disabled={!market}
          onClick={() => {
            state.side = "long";
            draw();
          }}
        >
          <span>LONG ▲</span>
        </button>
        <button
          className={`sidebtn short ${state.side === "short" ? "on" : ""}`}
          disabled={!market}
          onClick={() => {
            state.side = "short";
            draw();
          }}
        >
          <span>SHORT ▼</span>
        </button>
      </div>
      <div className="field">
        <div className="k">
          <span>COLLATERAL</span>
          <b>
            {market && wallet
              ? `${formatCollateral(balance.raw, market, true)} FREE`
              : "—"}
          </b>
        </div>
        <input
          className="colin"
          type="text"
          inputMode="decimal"
          value={state.collateralInput}
          disabled={!market}
          onInput={(event: Event) => {
            state.collateralInput = (
              event.currentTarget as HTMLInputElement
            ).value;
            draw();
          }}
        />
        <div className="chiprow noselect">
          {["50", "100", "250"].map((value) => (
            <button
              className="chip"
              disabled={!market}
              onClick={() => {
                state.collateralInput = value;
                draw();
              }}
            >
              <span>{value}</span>
            </button>
          ))}
          <button
            className="chip"
            disabled={!market}
            onClick={setMaxCollateral}
          >
            <span>MAX</span>
          </button>
        </div>
      </div>
      <div className="field">
        <div className="k">
          <span>LEVERAGE</span>
          <b>{Math.min(state.leverage, maxLeverage).toFixed(0)}x</b>
        </div>
        <input
          type="range"
          min="1"
          max={String(maxLeverage)}
          step="1"
          value={String(Math.min(state.leverage, maxLeverage))}
          disabled={!market}
          onInput={(event: Event) => {
            state.leverage = Number(
              (event.currentTarget as HTMLInputElement).value,
            );
            draw();
          }}
        />
        <div className="chiprow noselect">
          {[2, 5, 10, 25]
            .filter((value) => value <= maxLeverage)
            .map((value) => (
              <button
                className="chip"
                onClick={() => {
                  state.leverage = value;
                  draw();
                }}
              >
                <span>{value}x</span>
              </button>
            ))}
        </div>
      </div>
      <div className={`capnote ${market ? "" : "locked"}`}>
        {market ? (
          <span>
            MAX NOTIONAL <b>{formatCollateral(maxNotional, market, true)}</b> ·
            1% PRICE LIMIT · PROGRAM FEE 0
          </span>
        ) : (
          <span>
            <b>VIEW ONLY</b> · THIS TOKEN HAS NO INITIALIZED SOLARD PERP MARKET
          </span>
        )}
      </div>
      <div>
        <div className="qln">
          <span className="k">NOTIONAL</span>
          <span className="v">
            {market ? formatCollateral(notional, market, false) : "—"}
          </span>
        </div>
        <div className="qln">
          <span className="k">SIZE</span>
          <span className="v">
            {market ? `${formatNumber(size)} ${token.symbol}` : "—"}
          </span>
        </div>
        <div className="qln">
          <span className="k">LIQ PRICE</span>
          <span className="v am">
            {market
              ? `${stableLike(state.config?.collateralSymbol || "") ? "$" : ""}${liq.toFixed(liq < 1 ? 8 : 4)}`
              : "—"}
          </span>
        </div>
        <div className="qln">
          <span className="k">LIQ DISTANCE</span>
          <span className="v">{market ? `${distance.toFixed(1)}%` : "—"}</span>
        </div>
        <div className="qln">
          <span className="k">MAX LEVERAGE</span>
          <span className="v cy">
            {market ? `${maxLeverage.toFixed(0)}x` : "—"}
          </span>
        </div>
      </div>
      <button
        className={`openbtn ${state.side} ${!enabled && wallet ? "disabled" : ""}`}
        disabled={Boolean(market && wallet && !enabled)}
        onClick={() => void openPosition()}
      >
        <span>{buttonLabel}</span>
      </button>
    </aside>
  );
}

function Tape() {
  return (
    <div className="tape noselect">
      <div className="tape-label">
        MARKET TAPE{" "}
        <span className={state.feedConnected ? "pos" : "neg"}>
          · {state.feedConnected ? "LIVE" : "RETRYING"}
        </span>
      </div>
      <div className="tape-items">
        {state.tape.slice(0, 14).map((item, index) => (
          <button
            className={`tape-item ${index === 0 ? "new" : ""}`}
            onClick={() => setSelectedMint(item.mint)}
          >
            <span className={item.direction > 0 ? "pos" : "neg"}>
              {item.direction > 0 ? "▲" : "▼"}
            </span>{" "}
            <b>{item.symbol}</b> {formatUsd(item.value)}{" "}
            <span className="mut">@ {formatAge(item.time)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function FilterBar() {
  const tokens = mergedTokens();
  const counts: Record<FeedFilter, number> = {
    all: tokens.length,
    new: tokens.filter((token) => token.newPair).length,
    migrated: tokens.filter((token) => token.migrated).length,
    active: tokens.filter((token) => token.activePerp).length,
  };
  const filters: Array<{ id: FeedFilter; label: string }> = [
    { id: "all", label: "ALL" },
    { id: "new", label: "NEW PAIRS" },
    { id: "migrated", label: "MIGRATED" },
    { id: "active", label: "ACTIVE PERPS" },
  ];
  return (
    <div className="filterbar noselect">
      {filters.map((filter) => (
        <button
          className={`fseg ${state.filter === filter.id ? "on" : ""}`}
          onClick={() => {
            state.filter = filter.id;
            draw();
          }}
        >
          <span>{filter.label}</span>
          <span className="cnt">{counts[filter.id]}</span>
        </button>
      ))}
      <div className="fspacer" />
      {state.feedWarning && (
        <span className="feed-warning" title={state.feedWarning}>
          UPSTREAM DEGRADED
        </span>
      )}
    </div>
  );
}

function sortLabel(key: FeedSort, label: string): string {
  if (state.sortKey !== key) return label;
  return `${label} ${state.sortDirection < 0 ? "↓" : "↑"}`;
}

function setSort(key: FeedSort) {
  if (state.sortKey === key)
    state.sortDirection = state.sortDirection === 1 ? -1 : 1;
  else {
    state.sortKey = key;
    state.sortDirection = -1;
  }
  draw();
}

function MarketTable() {
  const tokens = filterTokens();
  return (
    <div className="tbl noselect">
      <div className="throw thead">
        <div className="th" />
        <button
          className={`th sortable ${state.sortKey === "created" ? "on" : ""}`}
          onClick={() => setSort("created")}
        >
          {sortLabel("created", "TOKEN / AGE")}
        </button>
        <button
          className={`th sortable r ${state.sortKey === "marketCap" ? "on" : ""}`}
          onClick={() => setSort("marketCap")}
        >
          {sortLabel("marketCap", "MARKET CAP")}
        </button>
        <button
          className={`th sortable r ${state.sortKey === "volume" ? "on" : ""}`}
          onClick={() => setSort("volume")}
        >
          {sortLabel("volume", "VOL 5M")}
        </button>
        <button
          className={`th sortable r ${state.sortKey === "leverage" ? "on" : ""}`}
          onClick={() => setSort("leverage")}
        >
          {sortLabel("leverage", "PERP → MAX")}
        </button>
      </div>
      <div id="rows">
        {tokens.length === 0 ? (
          <div className="empty rows-empty">NO TOKENS MATCH THIS FILTER</div>
        ) : (
          tokens.map((token) => {
            const selected = token.mint === state.selectedMint;
            const marketCap = token.marketCap || token.fdv;
            const status = token.activePerp
              ? token.paused
                ? "PAUSED"
                : token.settlementMode
                  ? "SETTLE"
                  : "LIVE"
              : token.migrated
                ? "MIGRATED"
                : token.newPair
                  ? "NEW"
                  : "PAIR";
            return (
              <div
                className={`throw trow ${selected ? "sel" : ""}`}
                onClick={() => setSelectedMint(token.mint)}
              >
                <div className="td starcell">
                  <button
                    className={`starbtn ${state.favorites.has(token.mint) ? "on" : ""}`}
                    onClick={(event: MouseEvent) => {
                      event.stopPropagation();
                      toggleFavorite(token.mint);
                    }}
                  >
                    ★
                  </button>
                </div>
                <div className="td tokcell">
                  <TokenAvatar token={token} />
                  <div className="tnm">
                    <div className="tk">
                      {token.symbol}{" "}
                      {token.activePerp && (
                        <span className="migbadge">PERP</span>
                      )}{" "}
                      {!token.activePerp && token.migrated && (
                        <span className="livebadge">MIGRATED</span>
                      )}
                    </div>
                    <div className="sub">
                      {formatAge(token.pairCreatedAt)} old ·{" "}
                      {shortAddress(token.mint, 4, 4)} · {token.dexId}
                    </div>
                  </div>
                </div>
                <div className="td r mccell">
                  {marketCap > 0 ? formatUsd(marketCap) : "—"}
                  <span className="mcsub">
                    LIQ{" "}
                    {token.liquidityUsd > 0
                      ? formatUsd(token.liquidityUsd)
                      : "—"}
                  </span>
                </div>
                <div className="td r">
                  {token.volumeM5 > 0 ? formatUsd(token.volumeM5) : "—"}
                  <span className="mcsub">
                    {token.buysM5}B / {token.sellsM5}S
                  </span>
                </div>
                <div className="td r">
                  <span
                    className={`fund ${token.activePerp ? "hi" : token.migrated ? "mid" : "lo"}`}
                  >
                    {status}
                  </span>
                  <span className="fundsub">
                    {token.activePerp
                      ? `→ ${token.maxLeverage.toFixed(0)}X`
                      : token.quoteSymbol}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function PositionDeck() {
  if (state.positions.length === 0)
    return <div className="empty">NO OPEN POSITIONS</div>;
  return (
    <div>
      {state.positions.map((item) => {
        const metrics = projectedPositionMetrics(item.position, item.market);
        const token =
          mergedTokens().find(
            (candidate) => candidate.mint === item.market.baseMint.toBase58(),
          ) || defaultMarketToken(item.market);
        const mark = item.market.poolPriceE6 || item.market.storedPriceE6;
        const distance =
          mark > 0n
            ? (Math.abs(Number(mark - metrics.liquidationPriceE6)) /
                Number(mark)) *
              100
            : 0;
        const roe =
          item.position.collateralAmount > 0n
            ? Number((metrics.pnl * 10_000n) / item.position.collateralAmount) /
              100
            : 0;
        return (
          <div className={`pcard ${item.position.side === "long" ? "l" : "s"}`}>
            <div>
              <div className="pline">
                <button
                  className="ptick"
                  onClick={() => setSelectedMint(token.mint)}
                >
                  {token.symbol}
                </button>
                <span
                  className={`pside ${item.position.side === "long" ? "pos" : "neg"}`}
                >
                  {item.position.side === "long" ? "▲ LONG" : "▼ SHORT"}{" "}
                  {(item.position.leverageBps / 10_000).toFixed(0)}X
                </span>
                <span className="pk">
                  {formatCollateral(
                    item.position.notionalAmount,
                    item.market,
                    true,
                  )}{" "}
                  · COL{" "}
                  {formatCollateral(
                    item.position.collateralAmount,
                    item.market,
                    true,
                  )}
                </span>
              </div>
              <div className="pk">
                ENTRY {formatPriceE6(item.position.entryPriceE6, 8)} →{" "}
                <span className="cy">{formatPriceE6(mark, 8)}</span> · LIQ{" "}
                <span className="am">
                  {formatPriceE6(metrics.liquidationPriceE6, 8)}
                </span>{" "}
                ({distance.toFixed(1)}%)
              </div>
              <div className={`liqbar ${distance < 5 ? "hot" : ""}`}>
                <i
                  style={`width:${Math.max(3, 100 - (Math.min(distance, 25) / 25) * 100)}%`}
                />
              </div>
            </div>
            <div className="pright">
              <span
                className={`pnlbig ${metrics.pnl > 0n ? "pos" : metrics.pnl < 0n ? "neg" : ""}`}
              >
                {formatCollateral(metrics.pnl, item.market, true)}
              </span>
              <span className={`pk ${roe > 0 ? "pos" : roe < 0 ? "neg" : ""}`}>
                {roe >= 0 ? "+" : ""}
                {roe.toFixed(1)}%
              </span>
              <button
                className="abtn cl"
                disabled={Boolean(state.txLabel)}
                onClick={() => void closePosition(item)}
              >
                <span>{state.txLabel ? state.txLabel : "CLOSE"}</span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function activityOwner(item: ActivityItem): string {
  return eventValue(item.data.owner || item.data.liquidator || "");
}

function HistoryDeck() {
  const wallet = state.client?.walletPublicKey?.toBase58() || null;
  const market = marketForMint(state.selectedMint);
  const relevant = state.activity.filter((item) => {
    if (!wallet) return true;
    const owner = activityOwner(item);
    return !owner || owner === wallet;
  });
  if (!market || relevant.length === 0)
    return <div className="empty">NO RECENT MARKET EVENTS</div>;
  return (
    <div>
      {relevant.slice(0, 14).map((item, index) => {
        const eventName = item.eventName
          .replace(/([a-z])([A-Z])/g, "$1 $2")
          .toUpperCase();
        const pnl =
          item.data.pnl !== undefined ? bigintFromUnknown(item.data.pnl) : null;
        return (
          <a
            className={`hrow ${index === 0 ? "new" : ""}`}
            href={explorerUrl("tx", item.signature)}
            target="_blank"
            rel="noreferrer"
          >
            <span className="htxt">
              <b>{eventName}</b>{" "}
              {activityOwner(item) ? shortAddress(activityOwner(item)) : ""}
              <span className="htime"> · {unixAgo(item.blockTime)}</span>
            </span>
            <span
              className={`hpnl ${pnl && pnl > 0n ? "pos" : pnl && pnl < 0n ? "neg" : ""}`}
            >
              {pnl === null ? "↗" : formatCollateral(pnl, market, true)}
            </span>
          </a>
        );
      })}
    </div>
  );
}

function LowerDeck() {
  return (
    <div className="deck">
      <div className="deckgrid">
        <div className="dsec possec">
          <div className="dhead noselect">
            <span className="seclabel">POSITIONS</span>
            <span className="n">
              {state.positions.length ? `${state.positions.length} OPEN` : ""}
            </span>
          </div>
          <div className="dbody">
            <PositionDeck />
          </div>
        </div>
        <div className="dsec histsec">
          <div className="dhead noselect">
            <span className="seclabel g">HISTORY</span>
            <span className="n">ON-CHAIN</span>
          </div>
          <div className="dbody">
            <HistoryDeck />
          </div>
        </div>
      </div>
    </div>
  );
}

function WalletModal() {
  if (!state.walletModal) return null;
  const byName = new Map(state.wallets.map((wallet) => [wallet.name, wallet]));
  const options: Array<{ name: WalletProviderName; label: string }> = [
    { name: "phantom", label: "Phantom" },
    { name: "solflare", label: "Solflare" },
    { name: "backpack", label: "Backpack" },
  ];
  return (
    <div
      className="modal-backdrop"
      onClick={(event: MouseEvent) => {
        if (event.target === event.currentTarget) {
          state.walletModal = false;
          draw();
        }
      }}
    >
      <div className="modal">
        <div className="modal-head">
          <h2>CONNECT SOLANA WALLET</h2>
          <button
            onClick={() => {
              state.walletModal = false;
              draw();
            }}
          >
            ESC
          </button>
        </div>
        <p>
          Wallets sign locally. Phantom is detected through{" "}
          <code>window.phantom.solana</code> with the legacy{" "}
          <code>window.solana</code> fallback.
        </p>
        <div className="wallet-options">
          {options.map((option) => {
            const wallet = byName.get(option.name);
            return wallet ? (
              <button
                disabled={state.walletConnecting}
                onClick={() => connectWalletFromGesture(wallet)}
              >
                <span>{option.label}</span>
                <b>
                  {state.walletConnecting && state.walletName === option.name
                    ? "WAITING…"
                    : "CONNECT →"}
                </b>
              </button>
            ) : (
              <a
                href={walletInstallUrl(option.name)}
                target="_blank"
                rel="noreferrer"
              >
                <span>{option.label}</span>
                <b>NOT DETECTED ↗</b>
              </a>
            );
          })}
        </div>
        {state.walletError && (
          <div className="wallet-error">
            <b>LAST ERROR</b>
            <span>{state.walletError}</span>
            {state.walletAttemptId && (
              <small>
                TRACE {state.walletAttemptId} · CLIENT SESSION {clientSessionId}
              </small>
            )}
            <button
              className="wallet-reset"
              disabled={state.walletConnecting}
              onClick={() => void resetWalletSession()}
            >
              {state.walletConnecting ? "RESETTING…" : "RESET WALLET SESSION"}
            </button>
          </div>
        )}
        <div className="wallet-diagnostic">
          ORIGIN {window.location.origin} · SECURE{" "}
          {window.isSecureContext ? "YES" : "NO"} · TOP LEVEL{" "}
          {window.top === window.self ? "YES" : "NO"} · PROVIDERS{" "}
          {state.wallets.length} · SESSION {clientSessionId}
        </div>
      </div>
    </div>
  );
}

function SearchModal() {
  if (!state.searchOpen) return null;
  const matches = searchMatches();
  return (
    <div
      className="cmdwrap show"
      onClick={(event: MouseEvent) => {
        if (event.target === event.currentTarget) closeSearch();
      }}
    >
      <div className="cmd">
        <div className="cmd-inwrap">
          <span className="pfx">/</span>
          <input
            id="search-input"
            type="text"
            placeholder="search token by name or mint…"
            value={state.searchQuery}
            onInput={(event: Event) => {
              state.searchQuery = (
                event.currentTarget as HTMLInputElement
              ).value;
              state.searchIndex = 0;
              draw();
            }}
          />
          <span className="cmd-esc">ESC</span>
        </div>
        <div className="cmd-list">
          {matches.length === 0 ? (
            <div className="cmd-empty">NO TOKEN FOUND</div>
          ) : (
            matches.map((token, index) => (
              <button
                className={`cmd-row ${index === state.searchIndex ? "hi" : ""}`}
                onClick={() => setSelectedMint(token.mint)}
              >
                <TokenAvatar token={token} />
                <span className="cn">
                  <span className="tk">
                    {token.symbol}{" "}
                    {token.activePerp && <span className="migbadge">PERP</span>}
                  </span>
                  <span className="sub">
                    {shortAddress(token.mint)} · {token.name}
                  </span>
                </span>
                <span className="cmc">
                  {token.marketCap || token.fdv
                    ? formatUsd(token.marketCap || token.fdv)
                    : "—"}
                  <span className="fundsub">
                    {token.activePerp
                      ? `${token.maxLeverage.toFixed(0)}x live`
                      : token.dexId}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
        <div className="cmd-foot noselect">
          <span>↑↓ NAVIGATE</span>
          <span>↵ SELECT</span>
          <span>ESC CLOSE</span>
        </div>
      </div>
    </div>
  );
}

function Toasts() {
  return (
    <div className="toasts">
      {state.toasts.map((item) => (
        <div className={`toast ${item.tone}`}>
          <span>{item.message}</span>
        </div>
      ))}
    </div>
  );
}

function ErrorBanner() {
  if (!state.error) return null;
  return (
    <div className="error-banner">
      <span>
        <b>RPC / PROGRAM ERROR</b> · {state.error}
      </span>
      <button onClick={() => void refreshMarkets(true)}>RETRY</button>
    </div>
  );
}

function SolardApp() {
  if (state.booting)
    return (
      <div className="boot-shell">
        <div className="boot-mark">SOLARD://</div>
        <div className="boot-copy">LOADING TOKEN SNAPSHOT</div>
      </div>
    );
  return (
    <div className="app-shell">
      <Topbar />
      <ErrorBanner />
      <div className="page">
        <TradePanel />
        <div className="right">
          <Tape />
          <FilterBar />
          <MarketTable />
          <LowerDeck />
        </div>
      </div>
      <WalletModal />
      <SearchModal />
      <Toasts />
    </div>
  );
}

export function mountSolardApp(root: HTMLElement, render: RenderFn) {
  rootElement = root;
  renderFunction = render;
  state = freshState();
  clearFeedPollTimer();
  feedPollAbort?.abort();
  feedPollAbort = null;
  feedPollInFlight = false;
  feedPollFailures = 0;
  feedPollSequence = 0;
  feedEtag = null;
  feedPayloadWarning = null;
  lastFeedAt = 0;
  walletConnectTask = null;
  document.addEventListener("keydown", handleKeydown);
  draw();
  void bootstrap().catch((error) => {
    state.booting = false;
    state.error = humanizeChainError(error);
    draw();
  });
  refreshTimer = window.setInterval(() => void refreshMarkets(false), 6_000);
}

export function unmountSolardApp(root: HTMLElement, render: RenderFn) {
  if (refreshTimer !== null) window.clearInterval(refreshTimer);
  clearFeedPollTimer();
  feedPollAbort?.abort();
  feedPollAbort = null;
  feedPollInFlight = false;
  feedPollFailures = 0;
  feedEtag = null;
  feedPayloadWarning = null;
  walletConnectTask = null;
  unbindFeedPollingLifecycle();
  refreshTimer = null;
  document.removeEventListener("keydown", handleKeydown);
  unbindWalletEvents();
  render(null, root);
  rootElement = null;
  renderFunction = null;
}
