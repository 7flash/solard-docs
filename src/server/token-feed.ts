import type { FeedToken, TokenFeedPayload } from "../types";
import { traceLabel } from "../observability/action";
import { serverMeasure } from "../observability/server";

const USER_AGENT = "SOLARD-TradJS/5.4";
const CACHE_MS = 8_000;
const NEW_PAIR_MS = 6 * 60 * 60 * 1_000;
const MAX_TOKENS = 70;

let cached: TokenFeedPayload | null = null;
let cachedAt = 0;
let pending: Promise<TokenFeedPayload> | null = null;

function numeric(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

async function fetchJson<T>(url: string, timeoutMs = 8_000): Promise<T> {
  const target = new URL(url);
  return serverMeasure(
    traceLabel("Fetch upstream JSON", {
      host: target.host,
      path: target.pathname,
      timeoutMs,
    }),
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          headers: {
            Accept: "application/json",
            "User-Agent": USER_AGENT,
          },
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(`${response.status} ${response.statusText}`);
        return (await response.json()) as T;
      } finally {
        clearTimeout(timer);
      }
    },
  );
}

type DexPair = {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  labels?: string[];
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
  priceNative?: string;
  priceUsd?: string | null;
  txns?: Record<string, { buys?: number; sells?: number }>;
  volume?: Record<string, number>;
  priceChange?: Record<string, number> | null;
  liquidity?: { usd?: number; base?: number; quote?: number } | null;
  fdv?: number | null;
  marketCap?: number | null;
  pairCreatedAt?: number | null;
  info?: { imageUrl?: string; websites?: Array<{ url?: string }> };
};

type TokenProfile = {
  chainId?: string;
  tokenAddress?: string;
  icon?: string;
};

type GeckoResource = {
  id?: string;
  type?: string;
  attributes?: Record<string, any>;
  relationships?: Record<string, { data?: { id?: string; type?: string } }>;
};

type GeckoResponse = {
  data?: GeckoResource[];
  included?: GeckoResource[];
};

type DiscoveryToken = {
  mint: string;
  symbol: string;
  name: string;
  imageUrl: string | null;
  pairAddress: string | null;
  dexId: string;
  quoteSymbol: string;
  url: string | null;
  priceUsd: number;
  priceNative: number;
  marketCap: number;
  fdv: number;
  liquidityUsd: number;
  volumeM5: number;
  volumeH1: number;
  priceChangeM5: number;
  buysM5: number;
  sellsM5: number;
  pairCreatedAt: number;
  source: "geckoterminal";
};

function addressFromGeckoId(id: string | undefined): string {
  if (!id) return "";
  const separator = id.indexOf("_");
  return separator >= 0 ? id.slice(separator + 1) : id;
}

function parseGecko(response: GeckoResponse): DiscoveryToken[] {
  const included = new Map<string, GeckoResource>();
  for (const resource of response.included || []) {
    if (resource.id) included.set(resource.id, resource);
  }

  const tokens: DiscoveryToken[] = [];
  for (const pool of response.data || []) {
    const attrs = pool.attributes || {};
    const baseRef = pool.relationships?.base_token?.data?.id;
    const quoteRef = pool.relationships?.quote_token?.data?.id;
    const dexRef = pool.relationships?.dex?.data?.id;
    const base = baseRef ? included.get(baseRef)?.attributes || {} : {};
    const quote = quoteRef ? included.get(quoteRef)?.attributes || {} : {};
    const dex = dexRef ? included.get(dexRef)?.attributes || {} : {};
    const mint = text(base.address) || addressFromGeckoId(baseRef);
    if (!mint) continue;

    const created = Date.parse(text(attrs.pool_created_at));
    const pairCreatedAt = Number.isFinite(created) ? created : Date.now();
    const transactions = attrs.transactions?.m5 || {};
    tokens.push({
      mint,
      symbol: text(base.symbol, text(attrs.name, "TOKEN").split("/")[0].trim()),
      name: text(
        base.name,
        text(attrs.name, "Unknown token").split("/")[0].trim(),
      ),
      imageUrl: text(base.image_url) || null,
      pairAddress: text(attrs.address) || addressFromGeckoId(pool.id) || null,
      dexId: text(dex.identifier, text(dexRef, "unknown")),
      quoteSymbol: text(quote.symbol, "SOL"),
      url: text(attrs.geckoterminal_url) || null,
      priceUsd: numeric(attrs.base_token_price_usd),
      priceNative: numeric(attrs.base_token_price_quote_token),
      marketCap: numeric(attrs.market_cap_usd),
      fdv: numeric(attrs.fdv_usd),
      liquidityUsd: numeric(attrs.reserve_in_usd),
      volumeM5: numeric(attrs.volume_usd?.m5),
      volumeH1: numeric(attrs.volume_usd?.h1),
      priceChangeM5: numeric(attrs.price_change_percentage?.m5),
      buysM5: numeric(transactions.buys),
      sellsM5: numeric(transactions.sells),
      pairCreatedAt,
      source: "geckoterminal",
    });
  }
  return tokens;
}

async function discoverNewPools(): Promise<DiscoveryToken[]> {
  return serverMeasure("Discover GeckoTerminal pools", async () => {
    const urls = [1, 2].map(
      (page) =>
        `https://api.geckoterminal.com/api/v2/networks/solana/new_pools?page=${page}&include=base_token,quote_token,dex`,
    );
    const results = await Promise.allSettled(
      urls.map((url) => fetchJson<GeckoResponse>(url)),
    );
    const tokens = results.flatMap((result) =>
      result.status === "fulfilled" ? parseGecko(result.value) : [],
    );
    serverMeasure.note(
      traceLabel("GeckoTerminal pools discovered", { tokens: tokens.length }),
    );
    return tokens;
  });
}

async function discoverDexAddresses(): Promise<Map<string, string | null>> {
  return serverMeasure("Discover DEX Screener profiles", async () => {
    const urls = [
      "https://api.dexscreener.com/token-profiles/latest/v1",
      "https://api.dexscreener.com/token-boosts/latest/v1",
      "https://api.dexscreener.com/token-boosts/top/v1",
    ];
    const results = await Promise.allSettled(
      urls.map((url) => fetchJson<TokenProfile[]>(url)),
    );
    const addresses = new Map<string, string | null>();
    for (const result of results) {
      if (result.status !== "fulfilled" || !Array.isArray(result.value))
        continue;
      for (const profile of result.value) {
        if (profile.chainId !== "solana" || !profile.tokenAddress) continue;
        addresses.set(
          profile.tokenAddress,
          profile.icon || addresses.get(profile.tokenAddress) || null,
        );
      }
    }
    serverMeasure.note(
      traceLabel("DEX Screener profiles discovered", {
        tokens: addresses.size,
      }),
    );
    return addresses;
  });
}

async function fetchDexPairs(addresses: string[]): Promise<DexPair[]> {
  return serverMeasure(
    traceLabel("Enrich DEX Screener pairs", { addresses: addresses.length }),
    async () => {
      const unique = [...new Set(addresses)].slice(0, 60);
      const batches: string[][] = [];
      for (let index = 0; index < unique.length; index += 30) {
        batches.push(unique.slice(index, index + 30));
      }
      const results = await Promise.allSettled(
        batches.map((batch) =>
          fetchJson<DexPair[]>(
            `https://api.dexscreener.com/tokens/v1/solana/${batch.join(",")}`,
          ),
        ),
      );
      const pairs = results.flatMap((result) =>
        result.status === "fulfilled" && Array.isArray(result.value)
          ? result.value
          : [],
      );
      serverMeasure.note(
        traceLabel("DEX Screener pairs enriched", { pairs: pairs.length }),
      );
      return pairs;
    },
  );
}

function pairScore(pair: DexPair): number {
  const liquidity = numeric(pair.liquidity?.usd);
  const volume = numeric(pair.volume?.h1);
  const migrationBonus = text(pair.dexId).toLowerCase().includes("pumpswap")
    ? 10_000_000
    : 0;
  return migrationBonus + liquidity + volume * 0.2;
}

function bestPairsByMint(pairs: DexPair[]): Map<string, DexPair> {
  const best = new Map<string, DexPair>();
  for (const pair of pairs) {
    if (pair.chainId !== "solana") continue;
    const mint = text(pair.baseToken?.address);
    if (!mint) continue;
    const current = best.get(mint);
    if (!current || pairScore(pair) > pairScore(current)) best.set(mint, pair);
  }
  return best;
}

function normalizeDexPair(
  pair: DexPair,
  fallbackImage: string | null = null,
): FeedToken | null {
  const mint = text(pair.baseToken?.address);
  if (!mint) return null;
  const created = numeric(pair.pairCreatedAt) || Date.now();
  const dexId = text(pair.dexId, "unknown");
  return {
    mint,
    pairAddress: text(pair.pairAddress) || null,
    symbol: text(pair.baseToken?.symbol, "TOKEN"),
    name: text(pair.baseToken?.name, "Unknown token"),
    imageUrl: text(pair.info?.imageUrl) || fallbackImage,
    dexId,
    quoteSymbol: text(pair.quoteToken?.symbol, "SOL"),
    url: text(pair.url) || null,
    priceUsd: numeric(pair.priceUsd),
    priceNative: numeric(pair.priceNative),
    marketCap: numeric(pair.marketCap) || numeric(pair.fdv),
    fdv: numeric(pair.fdv),
    liquidityUsd: numeric(pair.liquidity?.usd),
    volumeM5: numeric(pair.volume?.m5),
    volumeH1: numeric(pair.volume?.h1),
    priceChangeM5: numeric(pair.priceChange?.m5),
    buysM5: numeric(pair.txns?.m5?.buys),
    sellsM5: numeric(pair.txns?.m5?.sells),
    pairCreatedAt: created,
    newPair: Date.now() - created <= NEW_PAIR_MS,
    migrated: dexId.toLowerCase().includes("pumpswap"),
    activePerp: false,
    marketAddress: null,
    maxLeverage: 0,
    paused: false,
    settlementMode: false,
    source: "dexscreener",
  };
}

function normalizeDiscovery(token: DiscoveryToken): FeedToken {
  const dexId = token.dexId;
  return {
    ...token,
    marketCap: token.marketCap || token.fdv,
    newPair: Date.now() - token.pairCreatedAt <= NEW_PAIR_MS,
    migrated: dexId.toLowerCase().includes("pumpswap"),
    activePerp: false,
    marketAddress: null,
    maxLeverage: 0,
    paused: false,
    settlementMode: false,
  };
}

async function buildFeed(): Promise<TokenFeedPayload> {
  return serverMeasure("Build public token feed", async () => {
    const warnings: string[] = [];
    let discovered: DiscoveryToken[] = [];
    let profileImages = new Map<string, string | null>();

    const [geckoResult, profilesResult] = await Promise.allSettled([
      discoverNewPools(),
      discoverDexAddresses(),
    ]);
    if (geckoResult.status === "fulfilled") discovered = geckoResult.value;
    else warnings.push("GeckoTerminal new-pool discovery is unavailable.");
    if (profilesResult.status === "fulfilled")
      profileImages = profilesResult.value;
    else warnings.push("DEX Screener profile discovery is unavailable.");

    const addressOrder = [
      ...discovered.map((token) => token.mint),
      ...profileImages.keys(),
    ];
    const pairs = await fetchDexPairs(addressOrder);
    if (pairs.length === 0)
      warnings.push("DEX Screener pair enrichment returned no data.");
    const bestPairs = bestPairsByMint(pairs);
    const discoveredByMint = new Map(
      discovered.map((token) => [token.mint, token]),
    );
    const allMints = [...new Set([...addressOrder, ...bestPairs.keys()])];
    const tokens: FeedToken[] = [];

    for (const mint of allMints) {
      const pair = bestPairs.get(mint);
      const dexToken = pair
        ? normalizeDexPair(pair, profileImages.get(mint) || null)
        : null;
      if (dexToken) {
        const discovery = discoveredByMint.get(mint);
        if (discovery && discovery.pairCreatedAt > dexToken.pairCreatedAt) {
          dexToken.pairCreatedAt = discovery.pairCreatedAt;
          dexToken.newPair =
            Date.now() - discovery.pairCreatedAt <= NEW_PAIR_MS;
        }
        tokens.push(dexToken);
        continue;
      }
      const discovery = discoveredByMint.get(mint);
      if (discovery) tokens.push(normalizeDiscovery(discovery));
    }

    const deduped = [
      ...new Map(tokens.map((token) => [token.mint, token])).values(),
    ]
      .sort((a, b) => b.pairCreatedAt - a.pairCreatedAt)
      .slice(0, MAX_TOKENS);

    const payload: TokenFeedPayload = {
      tokens: deduped,
      updatedAt: Date.now(),
      source: "GeckoTerminal new pools + DEX Screener pair data",
      ...(warnings.length ? { warning: warnings.join(" ") } : {}),
    };
    serverMeasure.note(
      traceLabel("Public token feed built", {
        tokens: payload.tokens.length,
        warning: Boolean(payload.warning),
      }),
    );
    return payload;
  });
}

export async function getTokenFeed(force = false): Promise<TokenFeedPayload> {
  const now = Date.now();
  if (!force && cached && now - cachedAt < CACHE_MS) {
    serverMeasure.note(
      traceLabel("Token feed cache hit", {
        ageMs: now - cachedAt,
        tokens: cached.tokens.length,
      }),
    );
    return cached;
  }
  if (pending) {
    serverMeasure.note("Join pending token feed build");
    return pending;
  }

  pending = serverMeasure(
    traceLabel("Refresh token feed cache", { force }),
    async () => {
      try {
        const payload = await buildFeed();
        cached = payload;
        cachedAt = Date.now();
        return payload;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        serverMeasure.note(
          traceLabel("Token feed refresh degraded", { message }),
        );
        if (cached) {
          return {
            ...cached,
            updatedAt: Date.now(),
            warning: `Using cached token data: ${message}`,
          };
        }
        return {
          tokens: [],
          updatedAt: Date.now(),
          source: "upstream unavailable",
          warning: message,
        };
      }
    },
  ).finally(() => {
    pending = null;
  });
  return pending;
}
