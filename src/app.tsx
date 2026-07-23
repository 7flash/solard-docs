import { PublicKey } from "@solana/web3.js";
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
  FeedSort,
  FeedToken,
  InjectedWallet,
  MarketPosition,
  MarketSnapshot,
  SideName,
  SolardConfig,
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
  positionsScope: "all" | "mine";
  historyScope: "all" | "mine";
  balances: Record<string, WalletBalances>;
  walletBalance: WalletBalances;
  metricPulses: Record<
    string,
    {
      marketCapSequence: number;
      marketCapDirection: 1 | -1;
    }
  >;
  rowMenu: { id: number; mint: string; x: number; y: number } | null;
  activity: ActivityItem[];
  side: SideName;
  collateralInput: string;
  leverage: number;
  slippageBps: number;
  txLabel: string | null;
  lastSignature: string | null;
  lastRefresh: number | null;
  searchOpen: boolean;
  searchQuery: string;
  searchIndex: number;
  searchResults: FeedToken[];
  searchLoading: boolean;
  toasts: ToastItem[];
  arrivals: Set<string>;
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
let selectedMarketRefreshInFlight = false;
let lastFeedAt = 0;

const FEED_POLL_VISIBLE_MS = 2_000;
const FEED_POLL_HIDDEN_MS = 45_000;
const FEED_POLL_MAX_BACKOFF_MS = 60_000;
const FEED_REQUEST_TIMEOUT_MS = 12_000;
let walletEventProvider: InjectedWallet | null = null;
let walletDisconnectHandler: ((...args: unknown[]) => void) | null = null;
let walletAccountHandler: ((...args: unknown[]) => void) | null = null;
let walletConnectTask: Promise<void> | null = null;
let tokenArrivalQueue: FeedToken[] = [];
let tokenArrivalTimer: number | null = null;
let metricPulseSequence = 0;
let rowMenuSequence = 0;
let searchTimer: number | null = null;
let searchAbort: AbortController | null = null;
let searchRequestSequence = 0;
const resolvingMints = new Set<string>();

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
    sortKey: "age",
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
    positionsScope: "all",
    historyScope: "all",
    balances: {},
    walletBalance: { raw: 0n, totalRaw: 0n, ata: null },
    metricPulses: {},
    rowMenu: null,
    activity: [],
    side: "long",
    collateralInput: "0.1",
    leverage: 3,
    slippageBps: 100,
    txLabel: null,
    lastSignature: null,
    lastRefresh: null,
    searchOpen: false,
    searchQuery: "",
    searchIndex: 0,
    searchResults: [],
    searchLoading: false,
    toasts: [],
    arrivals: new Set<string>(),
  };
}

function draw() {
  if (!rootElement || !renderFunction) return;
  const active = document.activeElement;
  const focusId = active instanceof HTMLInputElement ? active.id : "";
  const selectionStart =
    active instanceof HTMLInputElement ? active.selectionStart : null;
  const selectionEnd =
    active instanceof HTMLInputElement ? active.selectionEnd : null;
  renderFunction(<SolardApp />, rootElement);
  if (focusId) {
    queueMicrotask(() => {
      const input = document.getElementById(focusId);
      if (!(input instanceof HTMLInputElement)) return;
      input.focus({ preventScroll: true });
      if (selectionStart !== null && selectionEnd !== null) {
        input.setSelectionRange(selectionStart, selectionEnd);
      }
    });
  }
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
  return market.baseMint.toBase58();
}

function stableLike(symbol: string): boolean {
  return /USD|USDC|USDT|PYUSD/i.test(symbol);
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

function formatSolMetric(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1_000_000_000)
    return `${(value / 1_000_000_000).toFixed(2)}B SOL`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M SOL`;
  if (value >= 10_000) return `${(value / 1_000).toFixed(1)}K SOL`;
  if (value >= 100) return `${value.toFixed(0)} SOL`;
  if (value >= 10) return `${value.toFixed(1)} SOL`;
  if (value >= 1) return `${value.toFixed(2)} SOL`;
  return `${value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")} SOL`;
}

function formatSolPrice(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    return "—";
  if (value >= 1)
    return `${value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")} SOL`;
  const decimals = Math.min(14, Math.max(8, Math.ceil(-Math.log10(value)) + 4));
  return `${value.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "")} SOL`;
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

function formatExternalPrice(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    return "$—";
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

function formatSol(raw: bigint, compact = false): string {
  return `${compact ? formatCompact(raw, 9) : formatToken(raw, 9, 4)} SOL`;
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
      item.position.baseMint.equals(market.baseMint),
    ) || null
  );
}

function balanceForMarket(market: MarketSnapshot | null): WalletBalances {
  if (!market) return { raw: 0n, totalRaw: 0n, ata: null };
  return (
    state.balances[marketId(market)] || { raw: 0n, totalRaw: 0n, ata: null }
  );
}

function defaultMarketToken(market: MarketSnapshot): FeedToken {
  const symbol = `TOKEN-${market.baseMint.toBase58().slice(0, 4).toUpperCase()}`;
  const mark = Number(market.poolPriceE6 || market.storedPriceE6) / 1_000_000;
  return {
    mint: market.baseMint.toBase58(),
    pairAddress: market.pumpswapPool.toBase58(),
    symbol,
    name: `${symbol} market`,
    imageUrl: null,
    dexId: "pumpswap",
    quoteSymbol: state.config?.collateralSymbol || "SOL",
    url: null,
    priceUsd: null,
    priceNative: mark > 0 ? mark : null,
    marketCap: null,
    fdv: null,
    liquidityUsd: null,
    marketCapSol: null,
    liquiditySol: null,
    pairCreatedAt: 0,
    tokenCreatedAt: null,
    newPair: false,
    migrated: true,
    activePerp: true,
    marketAddress: market.pumpswapPool.toBase58(),
    maxLeverage: 25,
    paused: market.paused,
    settlementMode: false,
    source: "onchain",
    seeded: false,
    seedRank: null,
  };
}
function provisionalToken(mint: string): FeedToken {
  return {
    mint,
    pairAddress: null,
    symbol: `NEW-${mint.slice(0, 4).toUpperCase()}`,
    name: "On-chain token lookup",
    imageUrl: null,
    dexId: "pumpswap",
    quoteSymbol: "SOL",
    url: null,
    priceUsd: null,
    priceNative: null,
    marketCap: null,
    fdv: null,
    liquidityUsd: null,
    marketCapSol: null,
    liquiditySol: null,
    pairCreatedAt: Date.now(),
    tokenCreatedAt: null,
    newPair: true,
    migrated: false,
    activePerp: false,
    marketAddress: null,
    maxLeverage: 0,
    paused: false,
    settlementMode: false,
    source: "onchain",
    seeded: false,
    seedRank: null,
  };
}

function validMintQuery(value: string): string | null {
  try {
    return new PublicKey(value.trim()).toBase58();
  } catch {
    return null;
  }
}

function isExecutableFeedToken(token: FeedToken): boolean {
  return Boolean(
    token.imageUrl &&
    token.pairAddress &&
    token.marketAddress &&
    token.activePerp &&
    token.maxLeverage > 0,
  );
}

function feedCandidates(): FeedToken[] {
  return state.feedTokens.filter(
    (token) => !state.hidden.has(token.mint) && isExecutableFeedToken(token),
  );
}

function mergedTokens(): FeedToken[] {
  const markets = new Map(
    state.markets.map((market) => [market.baseMint.toBase58(), market]),
  );
  return feedCandidates().map((token) => {
    const market = markets.get(token.mint);
    if (!market || market.pumpswapPool.toBase58() !== token.pairAddress)
      return token;
    const mark = Number(market.poolPriceE6 || market.storedPriceE6) / 1_000_000;
    return {
      ...token,
      priceNative: token.priceNative ?? (mark > 0 ? mark : null),
      migrated: true,
      activePerp: true,
      marketAddress: market.pumpswapPool.toBase58(),
      maxLeverage: 25,
      paused: market.paused,
      settlementMode: false,
    };
  });
}
function tokenHealth(token: FeedToken): number | null {
  // Health is based only on actual on-chain SOL liquidity plus migration age.
  // Missing reserve data produces no score rather than an invented fallback.
  const liquiditySol = token.liquiditySol;
  if (
    liquiditySol == null ||
    !Number.isFinite(liquiditySol) ||
    liquiditySol <= 0
  )
    return null;
  const ageHours =
    token.pairCreatedAt > 0
      ? Math.max(0, (Date.now() - token.pairCreatedAt) / 3_600_000)
      : 0;
  const liquidityScore = 5 + Math.log10(1 + liquiditySol) * 20;
  const ageConfidence =
    token.pairCreatedAt > 0 ? Math.min(10, Math.log2(ageHours + 1) * 2) : 0;
  return Math.max(1, Math.min(100, Math.round(liquidityScore + ageConfidence)));
}

function filterTokens(): FeedToken[] {
  const direction = state.sortDirection;
  const value = (token: FeedToken): number => {
    if (state.sortKey === "age") return token.pairCreatedAt || 0;
    if (state.sortKey === "health") return tokenHealth(token) ?? -1;
    return token.marketCapSol ?? -1;
  };
  const compare = (a: FeedToken, b: FeedToken): number => {
    const delta = value(a) - value(b);
    if (delta !== 0) return delta * direction;
    return b.pairCreatedAt - a.pairCreatedAt;
  };
  const candidates = mergedTokens();
  const seeded = candidates
    .filter((token) => token.seeded)
    .sort((a, b) => (a.seedRank ?? 999) - (b.seedRank ?? 999))
    .slice(0, 20);
  const seededMints = new Set(seeded.map((token) => token.mint));
  const unseeded = candidates.filter((token) => !seededMints.has(token.mint));
  const remaining = Math.max(0, 20 - seeded.length);

  // The normal terminal view is newest-first. Seeded markets are retained at
  // the top, then the newest indexed migrations fill the remaining rows.
  if (state.sortKey === "age") {
    const newest = unseeded
      .sort((a, b) => b.pairCreatedAt - a.pairCreatedAt)
      .slice(0, remaining);
    return [...seeded, ...newest].slice(0, 20);
  }

  // Clicking MARKET CAP or HEALTH ranks the same bounded market set while
  // keeping SOLARD, ANSEM and FARTCOIN present even if a metric is still warm.
  const ranked = unseeded.sort(compare).slice(0, remaining);
  return [...seeded, ...ranked].sort(compare).slice(0, 20);
}

function selectedToken(): FeedToken | null {
  const tokens = feedCandidates();
  return (
    tokens.find((token) => token.mint === state.selectedMint) ||
    tokens[0] ||
    null
  );
}

function ensureSelection() {
  const displayed = mergedTokens();
  const tokens = displayed.length ? displayed : feedCandidates();
  if (
    state.selectedMint &&
    tokens.some((token) => token.mint === state.selectedMint)
  )
    return;
  state.selectedMint =
    tokens.find((token) => token.activePerp)?.mint || tokens[0]?.mint || null;
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

function clearTokenArrivalTimer() {
  if (tokenArrivalTimer !== null) window.clearTimeout(tokenArrivalTimer);
  tokenArrivalTimer = null;
}

function mergeTokenRecord(
  existing: FeedToken | undefined,
  incoming: FeedToken,
): FeedToken {
  if (!existing) return incoming;
  return {
    ...existing,
    ...incoming,
    symbol: incoming.symbol === "NEW" ? existing.symbol : incoming.symbol,
    name: /^(New token|New Pump token|Unnamed token|Newly profiled token)$/i.test(
      incoming.name,
    )
      ? existing.name
      : incoming.name,
    imageUrl: incoming.imageUrl || existing.imageUrl,
    pairAddress: incoming.pairAddress || existing.pairAddress,
    url: incoming.url || existing.url,
    priceUsd: incoming.priceUsd ?? existing.priceUsd,
    priceNative: incoming.priceNative ?? existing.priceNative,
    marketCap: incoming.marketCap ?? existing.marketCap,
    fdv: incoming.fdv ?? existing.fdv,
    liquidityUsd: incoming.liquidityUsd ?? existing.liquidityUsd,
    marketCapSol: incoming.marketCapSol ?? existing.marketCapSol,
    liquiditySol: incoming.liquiditySol ?? existing.liquiditySol,
    migrated: incoming.migrated || existing.migrated,
    marketAddress: incoming.marketAddress || existing.marketAddress,
    pairCreatedAt: Math.max(incoming.pairCreatedAt, existing.pairCreatedAt),
    tokenCreatedAt: incoming.tokenCreatedAt ?? existing.tokenCreatedAt,
  };
}

function markMarketCapPulse(mint: string, direction: 1 | -1) {
  const previous = state.metricPulses[mint] || {
    marketCapSequence: 0,
    marketCapDirection: 1 as const,
  };
  const sequence = ++metricPulseSequence;
  state.metricPulses = {
    ...state.metricPulses,
    [mint]: {
      ...previous,
      marketCapSequence: sequence,
      marketCapDirection: direction,
    },
  };
}

async function processTokenArrivalQueue() {
  clearTokenArrivalTimer();
  const incoming = tokenArrivalQueue.shift();
  if (!incoming || !rootElement) return;
  // /api/tokens only emits server-verified PumpSwap pools with validated real
  // artwork. Insert those rows directly. Resolving every row again in the
  // browser previously triggered unsupported multi-account RPC requests.
  const current = new Map(state.feedTokens.map((token) => [token.mint, token]));
  current.set(
    incoming.mint,
    mergeTokenRecord(current.get(incoming.mint), incoming),
  );
  state.feedTokens = [...current.values()]
    .sort((left, right) => right.pairCreatedAt - left.pairCreatedAt)
    .slice(0, 120);
  state.arrivals = new Set([...state.arrivals, incoming.mint]);
  ensureSelection();
  draw();
  window.setTimeout(() => {
    const next = new Set(state.arrivals);
    next.delete(incoming.mint);
    state.arrivals = next;
    draw();
  }, 900);
  if (tokenArrivalQueue.length > 0 && rootElement)
    tokenArrivalTimer = window.setTimeout(
      () => void processTokenArrivalQueue(),
      140,
    );
}

function enqueueTokenArrivals(tokens: FeedToken[]) {
  const queued = new Set(tokenArrivalQueue.map((token) => token.mint));
  const current = new Set(state.feedTokens.map((token) => token.mint));
  const additions = tokens
    .filter(
      (token) =>
        !current.has(token.mint) &&
        !queued.has(token.mint) &&
        !state.hidden.has(token.mint),
    )
    .sort((left, right) => right.pairCreatedAt - left.pairCreatedAt)
    .slice(0, 40)
    .sort((left, right) => left.pairCreatedAt - right.pairCreatedAt);
  if (!additions.length) return;
  tokenArrivalQueue.push(...additions);
  if (tokenArrivalTimer === null) void processTokenArrivalQueue();
}

function applyFeed(payload: TokenFeedPayload) {
  const accepted = payload.tokens.filter(isExecutableFeedToken);
  const acceptedMints = new Set(accepted.map((token) => token.mint));
  tokenArrivalQueue = tokenArrivalQueue.filter(
    (token) => acceptedMints.has(token.mint) && !state.hidden.has(token.mint),
  );
  const previous = new Map(
    state.feedTokens.map((token) => [token.mint, token]),
  );
  const current = new Map<string, FeedToken>();
  const newcomers: FeedToken[] = [];

  for (const incoming of accepted) {
    const old = previous.get(incoming.mint);
    if (!old) {
      newcomers.push(incoming);
      continue;
    }
    const next = mergeTokenRecord(old, incoming);
    const oldMarketCap = old.marketCapSol;
    const nextMarketCap = next.marketCapSol;
    if (
      nextMarketCap != null &&
      oldMarketCap != null &&
      nextMarketCap > 0 &&
      oldMarketCap > 0 &&
      nextMarketCap !== oldMarketCap
    )
      markMarketCapPulse(incoming.mint, nextMarketCap > oldMarketCap ? 1 : -1);
    current.set(incoming.mint, next);
  }

  // A successful snapshot is authoritative. Pinned tokens are not allowed to
  // remain visible after their pool or artwork stops validating.
  state.feedTokens = [...current.values()]
    .sort((left, right) => right.pairCreatedAt - left.pairCreatedAt)
    .slice(0, 120);
  state.markets = state.markets.filter((market) =>
    accepted.some(
      (token) =>
        token.mint === market.baseMint.toBase58() &&
        token.pairAddress === market.pumpswapPool.toBase58(),
    ),
  );
  feedPayloadWarning = payload.warning || null;
  state.feedWarning = feedPayloadWarning;
  state.feedConnected = true;
  lastFeedAt = Date.now();
  enqueueTokenArrivals(newcomers);
  ensureSelection();
  draw();
  if (state.client && state.feedTokens.length > 0) void refreshMarkets(false);
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
          const params = new URLSearchParams();
          if (state.selectedMint) params.set("selected", state.selectedMint);
          const openMints = [
            ...new Set(
              state.positions.map((item) => item.position.baseMint.toBase58()),
            ),
          ];
          if (openMints.length) params.set("open", openMints.join(","));
          const visibleMints = filterTokens()
            .slice(0, 20)
            .map((token) => token.mint);
          if (visibleMints.length)
            params.set("visible", visibleMints.join(","));
          const pinnedMints = [...state.favorites].slice(0, 30);
          if (pinnedMints.length) params.set("pinned", pinnedMints.join(","));
          const endpoint = `/api/tokens${params.size ? `?${params}` : ""}`;
          const response = await fetch(endpoint, {
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

type IndexedPositionRow = {
  positionPda: string;
  owner: string;
  baseMint: string;
  pool: string;
  side: SideName;
  collateralAmount: string;
  leverageBps: number;
  notionalAmount: string;
  entryPriceE6: string;
  openedSlot: number;
  openedAt: number;
  openSignature: string;
};

type IndexedActivityRow = {
  signature: string;
  instruction: "open_position" | "close_position";
  owner: string;
  positionPda: string;
  baseMint: string;
  pool: string;
  side: SideName | null;
  collateralAmount: string | null;
  leverageBps: number | null;
  priceLimitE6: string | null;
  minPayout: string | null;
  slot: number;
  timestampMs: number;
};

async function fetchIndexedPositions(): Promise<IndexedPositionRow[]> {
  const response = await fetch("/api/positions?limit=250", {
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`Positions endpoint returned ${response.status}.`);
  const payload = (await response.json()) as {
    positions?: IndexedPositionRow[];
  };
  return Array.isArray(payload.positions) ? payload.positions : [];
}

async function fetchIndexedActivity(): Promise<ActivityItem[]> {
  const response = await fetch("/api/history?limit=100", { cache: "no-store" });
  if (!response.ok)
    throw new Error(`History endpoint returned ${response.status}.`);
  const payload = (await response.json()) as {
    activity?: IndexedActivityRow[];
  };
  return (Array.isArray(payload.activity) ? payload.activity : []).map(
    (row) => ({
      signature: row.signature,
      slot: row.slot,
      blockTime: Math.floor(row.timestampMs / 1_000),
      eventName:
        row.instruction === "open_position"
          ? "OPEN POSITION"
          : "CLOSE POSITION",
      data: {
        owner: row.owner,
        position: row.positionPda,
        baseMint: row.baseMint,
        pool: row.pool,
        side: row.side,
        collateralAmount: row.collateralAmount,
        leverageBps: row.leverageBps,
        priceLimitE6: row.priceLimitE6,
        minPayout: row.minPayout,
      },
    }),
  );
}

async function ensureIndexedTokens(mints: string[]): Promise<FeedToken[]> {
  const byMint = new Map(state.feedTokens.map((token) => [token.mint, token]));
  for (const mint of [...new Set(mints)]) {
    if (byMint.has(mint)) continue;
    try {
      const response = await fetch(
        `/api/tokens?mint=${encodeURIComponent(mint)}`,
        {
          cache: "no-store",
        },
      );
      if (!response.ok) continue;
      const payload = (await response.json()) as { token?: FeedToken | null };
      if (payload.token && isExecutableFeedToken(payload.token))
        byMint.set(mint, payload.token);
    } catch {
      // The next normal poll will retry indexed tokens.
    }
  }
  state.feedTokens = [...byMint.values()]
    .sort((left, right) => right.pairCreatedAt - left.pairCreatedAt)
    .slice(0, 160);
  return mints.flatMap((mint) => {
    const token = byMint.get(mint);
    return token ? [token] : [];
  });
}

async function refreshWalletBalance() {
  const owner = state.client?.walletPublicKey;
  if (!state.client || !owner) {
    state.walletBalance = { raw: 0n, totalRaw: 0n, ata: null };
    return;
  }
  try {
    state.walletBalance = await state.client.fetchSolBalance(owner);
    const selectedMarket = marketForMint(state.selectedMint);
    if (selectedMarket) {
      state.balances = {
        ...state.balances,
        [marketId(selectedMarket)]: state.walletBalance,
      };
    }
  } catch (error) {
    clientMeasure.note(
      traceLabel("Wallet balance refresh failed", {
        wallet: owner.toBase58(),
        message: errorRecord(error).message,
      }),
    );
  }
}

async function refreshSelectedMarket(
  force = true,
): Promise<MarketSnapshot | null> {
  if (!state.client || selectedMarketRefreshInFlight)
    return marketForMint(state.selectedMint);
  const token = selectedToken();
  if (!token) return null;
  selectedMarketRefreshInFlight = true;
  state.marketLoading = true;
  draw();
  try {
    const resolved = await state.client.fetchMarkets([token], force);
    const market = resolved[0] || null;
    state.markets = [
      ...state.markets.filter(
        (item) => item.baseMint.toBase58() !== token.mint,
      ),
      ...(market ? [market] : []),
    ];
    state.error = null;
    if (state.client.walletPublicKey) await refreshWalletBalance();
    return market;
  } catch (error) {
    state.error = humanizeChainError(error);
    return null;
  } finally {
    selectedMarketRefreshInFlight = false;
    state.marketLoading = false;
    draw();
  }
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
        await refreshWalletBalance();
        const indexedPositions = await fetchIndexedPositions();
        const neededMints = [
          ...(state.selectedMint ? [state.selectedMint] : []),
          ...indexedPositions.map((row) => row.baseMint),
        ];
        const neededTokens = await ensureIndexedTokens(neededMints);
        const markets = await state.client!.fetchIndexedMarkets(neededTokens);
        state.markets = markets;
        const byMint = new Map(
          markets.map((market) => [market.baseMint.toBase58(), market]),
        );
        state.positions = indexedPositions.flatMap((row) => {
          const market = byMint.get(row.baseMint);
          if (!market) return [];
          try {
            return [
              {
                market,
                position: {
                  address: new PublicKey(row.positionPda),
                  owner: new PublicKey(row.owner),
                  baseMint: new PublicKey(row.baseMint),
                  pool: new PublicKey(row.pool),
                  collateralAmount: BigInt(row.collateralAmount),
                  notionalAmount: BigInt(row.notionalAmount),
                  entryPriceE6: BigInt(row.entryPriceE6),
                  openedSlot: BigInt(row.openedSlot),
                  leverageBps: row.leverageBps,
                  side: row.side,
                  bump: 0,
                },
              },
            ];
          } catch {
            return [];
          }
        });
        state.error = null;
        state.lastRefresh = Date.now();
        ensureSelection();

        const owner = state.client!.walletPublicKey;
        if (owner) {
          const selectedMarket = marketForMint(state.selectedMint);
          if (selectedMarket) {
            state.balances = {
              ...state.balances,
              [marketId(selectedMarket)]: state.walletBalance,
            };
          }
        } else {
          state.balances = {};
          state.walletBalance = { raw: 0n, totalRaw: 0n, ata: null };
        }

        refreshSequence += 1;
        if (includeActivity || refreshSequence % 3 === 1)
          state.activity = await fetchIndexedActivity();
        clientMeasure.note(
          traceLabel("Indexed markets refreshed", {
            markets: markets.length,
            positions: state.positions.length,
            activity: state.activity.length,
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
      traceLabel("Bootstrap SOLARD trade app", {
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
        await refreshWalletBalance();
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
    state.walletBalance = { raw: 0n, totalRaw: 0n, ata: null };
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
        pool: marketForMint(state.selectedMint)?.address.toBase58() || null,
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

async function openPosition() {
  if (!state.client) return;
  let market = await refreshSelectedMarket(true);
  if (!market) {
    toast("PUMPSWAP POOL DATA IS UNAVAILABLE; REFRESHING THE PAIR", "warn");
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
  const balance =
    state.walletBalance.raw > 0n
      ? state.walletBalance
      : balanceForMarket(market);

  try {
    const collateralAmount = parseTokenAmount(
      state.collateralInput,
      market.collateralDecimals,
    );
    if (collateralAmount <= 0n)
      throw new Error("Collateral must be greater than zero.");
    if (collateralAmount > balance.raw)
      throw new Error("Insufficient collateral balance.");
    const maxLeverage = 25;
    const leverage = Math.max(1, Math.min(state.leverage, maxLeverage));
    const leverageBps = Math.round(leverage * 10_000);
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

async function resolvePumpSwapMint(mint: string): Promise<void> {
  if (resolvingMints.has(mint)) return;
  resolvingMints.add(mint);
  draw();
  try {
    const response = await fetch(
      `/api/tokens?mint=${encodeURIComponent(mint)}`,
      {
        cache: "no-store",
      },
    );
    if (!response.ok)
      throw new Error(`Token lookup returned ${response.status}.`);
    const payload = (await response.json()) as { token?: FeedToken | null };
    if (!payload.token || !isExecutableFeedToken(payload.token)) {
      state.feedTokens = state.feedTokens.filter(
        (token) => token.mint !== mint,
      );
      state.markets = state.markets.filter(
        (market) => market.baseMint.toBase58() !== mint,
      );
      state.favorites.delete(mint);
      if (state.selectedMint === mint) ensureSelection();
      toast("NO VERIFIED PUMPSWAP POOL EXISTS FOR THIS MINT", "warn");
      return;
    }
    const current = new Map(
      state.feedTokens.map((token) => [token.mint, token]),
    );
    current.set(mint, mergeTokenRecord(current.get(mint), payload.token));
    state.feedTokens = [...current.values()].sort(
      (left, right) => right.pairCreatedAt - left.pairCreatedAt,
    );
    state.selectedMint = mint;
    state.favorites.add(mint);
    draw();
    if (state.client) await refreshSelectedMarket(true);
  } catch (error) {
    toast(
      `TOKEN LOOKUP FAILED · ${errorRecord(error).message}`.toUpperCase(),
      "bad",
    );
  } finally {
    resolvingMints.delete(mint);
    draw();
  }
}

function setSelectedMint(mint: string, pin = false) {
  const normalized = validMintQuery(mint) || mint;
  state.selectedMint = normalized;
  if (pin) state.favorites.add(normalized);
  const market = marketForMint(normalized);
  if (market) state.leverage = Math.min(state.leverage, 25);
  state.searchOpen = false;
  state.searchQuery = "";
  draw();
  const token = mergedTokens().find((item) => item.mint === normalized);
  if (!token?.pairAddress || !token.activePerp) {
    void resolvePumpSwapMint(normalized);
  } else if (state.client) {
    void refreshSelectedMarket(true);
  }
}
function setMaxCollateral() {
  if (!state.client?.walletPublicKey) return;
  state.collateralInput = formatToken(state.walletBalance.raw, 9, 9);
  draw();
}
function toggleFavorite(mint: string) {
  if (state.favorites.has(mint)) state.favorites.delete(mint);
  else state.favorites.add(mint);
  draw();
}

function openRowMenu(event: MouseEvent, token: FeedToken) {
  event.preventDefault();
  event.stopPropagation();
  state.selectedMint = token.mint;
  const width = 210;
  const height = 158;
  state.rowMenu = {
    id: ++rowMenuSequence,
    mint: token.mint,
    x: Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8)),
    y: Math.max(8, Math.min(event.clientY, window.innerHeight - height - 8)),
  };
  draw();
  if (state.client) void refreshSelectedMarket(false);
}

function closeRowMenu() {
  if (!state.rowMenu) return;
  state.rowMenu = null;
  draw();
}

async function copyMint(mint: string) {
  try {
    await navigator.clipboard.writeText(mint);
    toast("TOKEN MINT COPIED", "good");
  } catch {
    toast("COULD NOT COPY TOKEN MINT", "bad");
  }
  closeRowMenu();
}

function openSearch() {
  state.searchOpen = true;
  state.searchQuery = "";
  state.searchIndex = 0;
  state.searchResults = [];
  state.searchLoading = false;
  draw();
  window.setTimeout(() => document.getElementById("search-input")?.focus(), 20);
}

function closeSearch() {
  state.searchOpen = false;
  state.searchQuery = "";
  state.searchIndex = 0;
  state.searchResults = [];
  state.searchLoading = false;
  if (searchTimer !== null) window.clearTimeout(searchTimer);
  searchTimer = null;
  searchAbort?.abort();
  searchAbort = null;
  draw();
}

function scheduleIndexedSearch(value: string) {
  if (searchTimer !== null) window.clearTimeout(searchTimer);
  searchAbort?.abort();
  searchAbort = null;
  const query = value.trim();
  if (query.length < 2 || validMintQuery(query)) {
    state.searchResults = [];
    state.searchLoading = false;
    return;
  }
  state.searchLoading = true;
  const sequence = ++searchRequestSequence;
  searchTimer = window.setTimeout(async () => {
    const controller = new AbortController();
    searchAbort = controller;
    try {
      const response = await fetch(
        `/api/tokens?q=${encodeURIComponent(query)}`,
        {
          cache: "no-store",
          signal: controller.signal,
        },
      );
      if (!response.ok) throw new Error(`search ${response.status}`);
      const payload = (await response.json()) as { tokens?: FeedToken[] };
      if (
        sequence !== searchRequestSequence ||
        query !== state.searchQuery.trim()
      )
        return;
      state.searchResults = Array.isArray(payload.tokens) ? payload.tokens : [];
      const byMint = new Map(
        state.feedTokens.map((token) => [token.mint, token]),
      );
      for (const token of state.searchResults) byMint.set(token.mint, token);
      state.feedTokens = [...byMint.values()]
        .sort((left, right) => right.pairCreatedAt - left.pairCreatedAt)
        .slice(0, 200);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        state.searchResults = [];
      }
    } finally {
      if (sequence === searchRequestSequence) {
        state.searchLoading = false;
        searchAbort = null;
        draw();
      }
    }
  }, 180);
}

function searchMatches(): FeedToken[] {
  const query = state.searchQuery.trim().toLowerCase();
  const local = mergedTokens();
  if (!query) return local.slice(0, 12);
  const combined = new Map<string, FeedToken>();
  for (const token of [...state.searchResults, ...local])
    combined.set(token.mint, token);
  const matches = [...combined.values()]
    .filter(
      (token) =>
        token.symbol.toLowerCase().includes(query) ||
        token.name.toLowerCase().includes(query) ||
        token.mint.toLowerCase().includes(query),
    )
    .slice(0, 12);
  const mint = validMintQuery(state.searchQuery);
  if (mint && !combined.has(mint)) {
    return [provisionalToken(mint), ...matches].slice(0, 12);
  }
  return matches;
}
function handleDocumentPointerDown(event: PointerEvent) {
  if (event.button !== 0 || !state.rowMenu) return;
  const target = event.target;
  if (target instanceof Element && target.closest(".row-menu")) return;
  closeRowMenu();
}

function handleDocumentContextMenu(event: MouseEvent) {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest(".row-menu")) {
    event.preventDefault();
    return;
  }

  const row = target?.closest<HTMLElement>("[data-market-mint]");
  const mint = row?.dataset.marketMint;
  if (!mint) {
    if (state.rowMenu) closeRowMenu();
    return;
  }

  const token = mergedTokens().find((item) => item.mint === mint);
  if (!token) return;

  event.preventDefault();
  event.stopPropagation();
  openRowMenu(event, token);
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
  if (event.key === "Escape" && state.rowMenu) {
    event.preventDefault();
    closeRowMenu();
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
    setSelectedMint(matches[state.searchIndex].mint, true);
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

function TokenAvatar({
  token,
  large = false,
}: {
  token: FeedToken;
  large?: boolean;
}) {
  if (!token.imageUrl) return null;
  return (
    <div className={`av ${large ? "large" : ""}`}>
      <img
        src={token.imageUrl}
        alt=""
        loading={large ? "eager" : "lazy"}
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => {
          state.hidden.add(token.mint);
          state.feedTokens = state.feedTokens.filter(
            (item) => item.mint !== token.mint,
          );
          state.markets = state.markets.filter(
            (market) => market.baseMint.toBase58() !== token.mint,
          );
          state.favorites.delete(token.mint);
          ensureSelection();
          draw();
        }}
      />
    </div>
  );
}

function Topbar() {
  const market = marketForMint(state.selectedMint);
  const position = positionForMarket(market);
  const balance = state.walletBalance;
  const metrics =
    position && market
      ? projectedPositionMetrics(position.position, market)
      : null;
  const equity = metrics
    ? balance.totalRaw + (metrics.equity > 0n ? metrics.equity : 0n)
    : balance.totalRaw;
  const wallet = state.client?.walletPublicKey || null;
  return (
    <header className="topbar noselect">
      <div className="brand">
        <Logo />
        <div className="wordmark">
          SOLARD<i>://</i>
        </div>
      </div>
      {metrics && market && wallet ? (
        <div className="acct">
          <div>
            <span className="k">UNREALIZED</span>
            <span
              className={`v ${metrics.pnl > 0n ? "pos" : metrics.pnl < 0n ? "neg" : ""}`}
            >
              {formatCollateral(metrics.pnl, market, true)}
            </span>
          </div>
          <div>
            <span className="k">EQUITY</span>
            <span className="v">{formatSol(equity, true)}</span>
          </div>
        </div>
      ) : (
        <div className="acct acct-empty" />
      )}
      <div
        className={`stream-dot ${state.feedConnected ? "live" : ""}`}
        title={
          state.feedConnected
            ? "Token polling active"
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
        {wallet ? (
          <>
            <span className="wallet-address">{shortAddress(wallet)}</span>
            <span className="wallet-balance">
              {formatSol(balance.totalRaw, true)}
            </span>
          </>
        ) : (
          <span>
            {state.walletConnecting ? "CONNECTING…" : "CONNECT WALLET"}
          </span>
        )}
      </button>
    </header>
  );
}

function TradePanel() {
  const token = selectedToken();
  if (!token) {
    return (
      <aside className="ticket">
        <div className="emptypanel">WAITING FOR INDEXED MIGRATIONS</div>
      </aside>
    );
  }
  const market = marketForMint(token.mint);
  const position = positionForMarket(market);
  const balance = state.walletBalance;
  const wallet = state.client?.walletPublicKey || null;
  const maxLeverage = 25;
  const mark = market ? market.poolPriceE6 || market.storedPriceE6 : 0n;
  const markHuman =
    token.priceNative ?? (market ? Number(mark) / 1_000_000 : 0);
  const mmr = 0;
  const liqMultiplier =
    state.side === "long"
      ? 1 + mmr - 1 / Math.max(state.leverage, 1)
      : 1 - mmr + 1 / Math.max(state.leverage, 1);
  const liq = Math.max(0, markHuman * liqMultiplier);
  const distance =
    markHuman > 0 ? (Math.abs(markHuman - liq) / markHuman) * 100 : 0;
  const enabled = Boolean(
    market && !market.paused && !position && !state.txLabel,
  );
  const buttonLabel = !market
    ? !wallet
      ? "CONNECT WALLET TO TRADE"
      : resolvingMints.has(token.mint) || state.marketLoading
        ? "RESOLVING VERIFIED POOL…"
        : "RETRY MARKET DATA"
    : position
      ? "POSITION ALREADY OPEN"
      : market.paused
        ? "MARKET PAUSED"
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
        <span className="p">{formatSolPrice(markHuman)}</span>
      </div>
      <div className="sidegrp noselect">
        <button
          className={`sidebtn long ${state.side === "long" ? "on" : ""}`}
          onClick={() => {
            state.side = "long";
            draw();
          }}
        >
          <span>LONG ▲</span>
        </button>
        <button
          className={`sidebtn short ${state.side === "short" ? "on" : ""}`}
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
          <span>BET AMOUNT (SOL)</span>
          <b>{wallet ? `${formatSol(balance.raw, true)} FREE` : "—"}</b>
        </div>
        <input
          className="colin"
          type="text"
          inputMode="decimal"
          value={state.collateralInput}
          onInput={(event: Event) => {
            state.collateralInput = (
              event.currentTarget as HTMLInputElement
            ).value;
            draw();
          }}
        />
        <div className="chiprow noselect">
          {["0.1", "0.5", "1"].map((value) => (
            <button
              className="chip"
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
            disabled={!wallet}
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
          key={`leverage-${state.leverage}`}
          className="leverage-range"
          type="range"
          min="1"
          max={String(maxLeverage)}
          step="1"
          value={String(Math.min(state.leverage, maxLeverage))}
          style={`--range-progress:${((Math.min(state.leverage, maxLeverage) - 1) / (maxLeverage - 1)) * 100}%`}
          onInput={(event: Event) => {
            state.leverage = Number(
              (event.currentTarget as HTMLInputElement).value,
            );
            draw();
          }}
          onChange={(event: Event) => {
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
      <div className="risk-summary">
        <div className="qln">
          <span className="k">LIQ PRICE</span>
          <span className="v am">
            {markHuman > 0 ? formatSolPrice(liq) : "—"}
          </span>
        </div>
        <div className="qln">
          <span className="k">LIQ DISTANCE</span>
          <span className="v">
            {markHuman > 0 ? `${distance.toFixed(1)}%` : "—"}
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
          className={`th sortable ${state.sortKey === "age" ? "on" : ""}`}
          onClick={() => setSort("age")}
        >
          {sortLabel("age", "TOKEN / AGE")}
        </button>
        <button
          className={`th sortable r ${state.sortKey === "marketCap" ? "on" : ""}`}
          onClick={() => setSort("marketCap")}
        >
          {sortLabel("marketCap", "MARKET CAP (SOL)")}
        </button>
        <button
          className={`th sortable r ${state.sortKey === "health" ? "on" : ""}`}
          onClick={() => setSort("health")}
        >
          {sortLabel("health", "HEALTH")}
        </button>
      </div>
      <div id="rows">
        {tokens.length === 0 ? (
          <div className="empty rows-empty">
            WAITING FOR MIGRATED PUMPSWAP MARKETS
          </div>
        ) : (
          tokens.map((token) => {
            const selected = token.mint === state.selectedMint;
            const marketCapSol = token.marketCapSol;
            const health = tokenHealth(token);
            return (
              <div
                key={token.mint}
                className={`throw trow ${selected ? "sel" : ""} ${state.arrivals.has(token.mint) ? "arrive" : ""}`}
                data-market-mint={token.mint}
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
                    <div className="tk">{token.symbol} </div>
                    <div className="sub">
                      {`${formatAge(token.tokenCreatedAt ?? token.pairCreatedAt)} old`}{" "}
                      · {shortAddress(token.mint, 4, 4)} · {token.dexId}
                    </div>
                  </div>
                </div>
                <div className="td r mccell">
                  <span
                    key={`mc-${token.mint}-${state.metricPulses[token.mint]?.marketCapSequence || 0}`}
                    className={`metric-value ${state.metricPulses[token.mint]?.marketCapSequence ? `pulse ${state.metricPulses[token.mint].marketCapDirection > 0 ? "up" : "down"}` : ""}`}
                  >
                    {marketCapSol != null && marketCapSol > 0
                      ? formatSolMetric(marketCapSol)
                      : "—"}
                  </span>
                  <span className="mcsub">
                    LIQ{" "}
                    {token.liquiditySol != null && token.liquiditySol > 0
                      ? formatSolMetric(token.liquiditySol)
                      : "—"}
                  </span>
                </div>
                <div className="td r">
                  <span
                    className={`health ${health == null ? "na" : health >= 70 ? "hi" : health >= 35 ? "mid" : "lo"}`}
                  >
                    {health ?? "—"}
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
  const wallet = state.client?.walletPublicKey?.toBase58() || null;
  const positions =
    state.positionsScope === "mine" && wallet
      ? state.positions.filter(
          (item) => item.position.owner.toBase58() === wallet,
        )
      : state.positions;
  if (positions.length === 0)
    return <div className="empty">NO OPEN POSITIONS</div>;
  return (
    <div>
      {positions.map((item) => {
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
          <div
            key={item.position.address.toBase58()}
            className={`pcard ${item.position.side === "long" ? "l" : "s"}`}
          >
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
                  BET{" "}
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
              <a
                className="posscan"
                href={explorerUrl("account", item.position.address.toBase58())}
                target="_blank"
                rel="noreferrer"
              >
                SOLSCAN ↗
              </a>
              {wallet === item.position.owner.toBase58() && (
                <button
                  className="abtn cl"
                  disabled={Boolean(state.txLabel)}
                  onClick={() => void closePosition(item)}
                >
                  <span>{state.txLabel ? state.txLabel : "CLOSE"}</span>
                </button>
              )}
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
    if (state.historyScope === "all" || !wallet) return true;
    return activityOwner(item) === wallet;
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
            key={item.signature}
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
            <button
              className={`scope-switch ${state.positionsScope === "mine" ? "on" : ""}`}
              role="switch"
              aria-checked={state.positionsScope === "mine"}
              onClick={() => {
                state.positionsScope =
                  state.positionsScope === "mine" ? "all" : "mine";
                draw();
              }}
            >
              <i />
              <span>ONLY MINE</span>
            </button>
          </div>
          <div className="dbody">
            <PositionDeck />
          </div>
        </div>
        <div className="dsec histsec">
          <div className="dhead noselect">
            <span className="seclabel g">HISTORY</span>
            <button
              className={`scope-switch ${state.historyScope === "mine" ? "on" : ""}`}
              role="switch"
              aria-checked={state.historyScope === "mine"}
              onClick={() => {
                state.historyScope =
                  state.historyScope === "mine" ? "all" : "mine";
                draw();
              }}
            >
              <i />
              <span>ONLY MINE</span>
            </button>
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
            placeholder="search by symbol, name, or mint…"
            value={state.searchQuery}
            onInput={(event: Event) => {
              state.searchQuery = (
                event.currentTarget as HTMLInputElement
              ).value;
              state.searchIndex = 0;
              scheduleIndexedSearch(state.searchQuery);
              draw();
            }}
          />
          <span className="cmd-esc">ESC</span>
        </div>
        <div className="cmd-list">
          {matches.length === 0 ? (
            <div className="cmd-empty">
              {state.searchLoading ? "SEARCHING INDEX…" : "NO TOKEN FOUND"}
            </div>
          ) : (
            matches.map((token, index) => (
              <button
                className={`cmd-row ${index === state.searchIndex ? "hi" : ""}`}
                onClick={() => setSelectedMint(token.mint, true)}
              >
                <TokenAvatar token={token} />
                <span className="cn">
                  <span className="tk">{token.symbol}</span>
                  <span className="sub">
                    {shortAddress(token.mint)} · {token.name}
                  </span>
                </span>
                <span className="cmc">
                  {token.marketCapSol != null
                    ? formatSolMetric(token.marketCapSol)
                    : "—"}
                  <span className="fundsub">
                    Health {tokenHealth(token) ?? "—"}
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

function RowContextMenu() {
  const menu = state.rowMenu;
  if (!menu) return null;
  const token = mergedTokens().find((item) => item.mint === menu.mint);
  if (!token) return null;
  return (
    <div
      key={menu.id}
      className="row-menu"
      data-menu-instance={menu.id}
      style={`left:${menu.x}px;top:${menu.y}px`}
      onPointerDown={(event: PointerEvent) => event.stopPropagation()}
      onContextMenu={(event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <b>{token.symbol}</b>
      <button
        onClick={() => {
          toggleFavorite(token.mint);
          closeRowMenu();
        }}
      >
        {state.favorites.has(token.mint) ? "UNPIN TOKEN" : "PIN TOKEN"}
      </button>
      <button onClick={() => void copyMint(token.mint)}>COPY MINT</button>
      <a
        href={explorerUrl("account", token.mint)}
        target="_blank"
        rel="noreferrer"
        onClick={closeRowMenu}
      >
        OPEN IN SOLSCAN ↗
      </a>
      {token.url ? (
        <a
          href={token.url}
          target="_blank"
          rel="noreferrer"
          onClick={closeRowMenu}
        >
          OPEN MARKET ↗
        </a>
      ) : null}
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
          <MarketTable />
          <LowerDeck />
        </div>
      </div>
      <WalletModal />
      <SearchModal />
      <RowContextMenu />
      <Toasts />
    </div>
  );
}

export function mountSolardApp(root: HTMLElement, render: RenderFn) {
  rootElement = root;
  renderFunction = render;
  state = freshState();
  clearTokenArrivalTimer();
  tokenArrivalQueue = [];
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
  if (searchTimer !== null) window.clearTimeout(searchTimer);
  searchTimer = null;
  searchAbort?.abort();
  searchAbort = null;
  searchRequestSequence = 0;
  document.addEventListener("keydown", handleKeydown);
  document.addEventListener("pointerdown", handleDocumentPointerDown);
  document.addEventListener("contextmenu", handleDocumentContextMenu, true);
  draw();
  void bootstrap().catch((error) => {
    state.booting = false;
    state.error = humanizeChainError(error);
    draw();
  });
  refreshTimer = window.setInterval(() => void refreshMarkets(false), 12_000);
}

export function unmountSolardApp(root: HTMLElement, render: RenderFn) {
  if (refreshTimer !== null) window.clearInterval(refreshTimer);
  clearTokenArrivalTimer();
  tokenArrivalQueue = [];
  clearFeedPollTimer();
  feedPollAbort?.abort();
  feedPollAbort = null;
  feedPollInFlight = false;
  feedPollFailures = 0;
  feedEtag = null;
  feedPayloadWarning = null;
  walletConnectTask = null;
  if (searchTimer !== null) window.clearTimeout(searchTimer);
  searchTimer = null;
  searchAbort?.abort();
  searchAbort = null;
  unbindFeedPollingLifecycle();
  refreshTimer = null;
  document.removeEventListener("keydown", handleKeydown);
  document.removeEventListener("pointerdown", handleDocumentPointerDown);
  document.removeEventListener("contextmenu", handleDocumentContextMenu, true);
  unbindWalletEvents();
  render(null, root);
  rootElement = null;
  renderFunction = null;
}
