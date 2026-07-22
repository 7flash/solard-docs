export type MarketWindow = {
  buys: number;
  sells: number;
  volume: number;
  change: number;
};

export type DexMarket = {
  chainId: string;
  dexId: string;
  pairAddress: string;
  url: string;
  labels: string[];
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceNative: number | null;
  priceUsd: number | null;
  liquidityUsd: number;
  fdv: number | null;
  marketCap: number | null;
  pairCreatedAt: number | null;
  imageUrl: string | null;
  boostsActive: number;
  windows: {
    m5: MarketWindow;
    h1: MarketWindow;
    h6: MarketWindow;
    h24: MarketWindow;
  };
};

export type DexMarketSnapshot = {
  ok: true;
  source: "configured" | "boosted" | "profiles" | "search";
  chainId: "solana";
  fetchedAt: number;
  cached: boolean;
  stale: boolean;
  refreshAfterMs: number;
  markets: DexMarket[];
};

export type DexMarketError = {
  ok: false;
  error: string;
};

export function formatUsd(value: number | null | undefined, compact = true) {
  if (value == null || !Number.isFinite(value)) return "—";
  const absolute = Math.abs(value);
  if (compact && absolute >= 1_000_000_000)
    return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (compact && absolute >= 1_000_000)
    return `$${(value / 1_000_000).toFixed(2)}M`;
  if (compact && absolute >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  if (absolute >= 1)
    return `$${value.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
  if (absolute >= 0.01) return `$${value.toFixed(4)}`;
  if (absolute === 0) return "$0";
  return `$${value.toPrecision(4)}`;
}

export function formatPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(Math.abs(value) >= 100 ? 0 : 2)}%`;
}

export function shortAddress(value: string, head = 4, tail = 4) {
  if (!value || value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}
