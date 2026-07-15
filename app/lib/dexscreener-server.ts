import type { DexMarket, MarketWindow } from "./market";

const DEFAULT_BASE_URL = "https://api.dexscreener.com";
const REQUEST_TIMEOUT_MS = 8_000;

type RawPair = Record<string, any>;

export function dexBaseUrl() {
  return (process.env.DEXSCREENER_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object" && Array.isArray((value as any).data)) return (value as any).data as T[];
  if (value && typeof value === "object") return [value as T];
  return [];
}

function finiteNumber(value: unknown, fallback = 0): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nullableNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function fetchDexJson(pathOrUrl: string) {
  const url = /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `${dexBaseUrl()}/${pathOrUrl.replace(/^\/+/, "")}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "solard-tradjs-market-view/1.2" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`DEX Screener returned HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function windowFor(pair: RawPair, key: "m5" | "h1" | "h6" | "h24"): MarketWindow {
  return {
    buys: finiteNumber(pair.txns?.[key]?.buys),
    sells: finiteNumber(pair.txns?.[key]?.sells),
    volume: finiteNumber(pair.volume?.[key]),
    change: finiteNumber(pair.priceChange?.[key]),
  };
}

export function normalizeDexPair(pair: RawPair): DexMarket | null {
  if (pair?.chainId !== "solana" || !pair?.pairAddress || !pair?.baseToken?.address) return null;
  return {
    chainId: "solana",
    dexId: String(pair.dexId ?? "unknown"),
    pairAddress: String(pair.pairAddress),
    url: String(pair.url ?? `https://dexscreener.com/solana/${pair.pairAddress}`),
    labels: Array.isArray(pair.labels) ? pair.labels.map(String) : [],
    baseToken: {
      address: String(pair.baseToken.address),
      name: String(pair.baseToken.name ?? pair.baseToken.symbol ?? "Unknown token"),
      symbol: String(pair.baseToken.symbol ?? "?").slice(0, 24),
    },
    quoteToken: {
      address: String(pair.quoteToken?.address ?? ""),
      name: String(pair.quoteToken?.name ?? pair.quoteToken?.symbol ?? "Unknown quote"),
      symbol: String(pair.quoteToken?.symbol ?? "?").slice(0, 16),
    },
    priceNative: nullableNumber(pair.priceNative),
    priceUsd: nullableNumber(pair.priceUsd),
    liquidityUsd: finiteNumber(pair.liquidity?.usd),
    fdv: nullableNumber(pair.fdv),
    marketCap: nullableNumber(pair.marketCap),
    pairCreatedAt: nullableNumber(pair.pairCreatedAt),
    imageUrl: typeof pair.info?.imageUrl === "string" ? pair.info.imageUrl : null,
    boostsActive: finiteNumber(pair.boosts?.active),
    windows: {
      m5: windowFor(pair, "m5"),
      h1: windowFor(pair, "h1"),
      h6: windowFor(pair, "h6"),
      h24: windowFor(pair, "h24"),
    },
  };
}

export function selectBestDexPairs(rawPairs: RawPair[], limit: number) {
  const bestByToken = new Map<string, DexMarket>();
  for (const rawPair of rawPairs) {
    const market = normalizeDexPair(rawPair);
    if (!market) continue;
    const existing = bestByToken.get(market.baseToken.address);
    const score = market.liquidityUsd * 10 + market.windows.h24.volume;
    const existingScore = existing ? existing.liquidityUsd * 10 + existing.windows.h24.volume : -1;
    if (!existing || score > existingScore) bestByToken.set(market.baseToken.address, market);
  }
  return [...bestByToken.values()]
    .sort((a, b) => b.boostsActive - a.boostsActive || b.windows.h24.volume - a.windows.h24.volume || b.liquidityUsd - a.liquidityUsd)
    .slice(0, limit);
}

export async function pairsForDexAddresses(addresses: string[]) {
  if (!addresses.length) return [];
  return asArray<RawPair>(await fetchDexJson(`tokens/v1/solana/${addresses.map(encodeURIComponent).join(",")}`));
}

export async function bestDexPairsByToken(addresses: string[]) {
  const pairs = await pairsForDexAddresses(addresses);
  const selected = selectBestDexPairs(pairs, addresses.length);
  return new Map(selected.map((market) => [market.baseToken.address, market]));
}
