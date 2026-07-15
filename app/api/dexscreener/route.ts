import type { DexMarketSnapshot } from "../../lib/market";
import { asArray, fetchDexJson, pairsForDexAddresses, selectBestDexPairs } from "../../lib/dexscreener-server";

const DEFAULT_CACHE_MS = 20_000;
const MIN_CACHE_MS = 10_000;
const MAX_CACHE_MS = 120_000;
const MAX_TOKENS = 30;
const DEFAULT_LIMIT = 12;
const FALLBACK_QUERY = "SOL/USDC";

type RawPair = Record<string, any>;
type CacheEntry = { expiresAt: number; snapshot: DexMarketSnapshot };
const cache = new Map<string, CacheEntry>();

function clampInteger(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function cacheMs() {
  const configured = Number.parseInt(process.env.DEXSCREENER_CACHE_MS ?? "", 10);
  if (!Number.isFinite(configured)) return DEFAULT_CACHE_MS;
  return Math.min(MAX_CACHE_MS, Math.max(MIN_CACHE_MS, configured));
}

function splitAddresses(value: string | null | undefined) {
  return [...new Set((value ?? "").split(/[\s,]+/).map((item) => item.trim()).filter(Boolean))].slice(0, MAX_TOKENS);
}

async function discoverAddresses(endpoint: "token-boosts/top/v1" | "token-profiles/latest/v1") {
  const values = asArray<Record<string, any>>(await fetchDexJson(endpoint));
  return [...new Set(values
    .filter((item) => item?.chainId === "solana" && typeof item?.tokenAddress === "string")
    .map((item) => item.tokenAddress as string))]
    .slice(0, MAX_TOKENS);
}

async function loadMarkets(limit: number, query: string | null, requestAddresses: string[]) {
  if (query) {
    const payload = await fetchDexJson(`latest/dex/search?q=${encodeURIComponent(query)}`);
    return { source: "search" as const, pairs: asArray<RawPair>(payload?.pairs) };
  }

  const configured = requestAddresses.length ? requestAddresses : splitAddresses(process.env.DEXSCREENER_TOKEN_ADDRESSES);
  if (configured.length) return { source: "configured" as const, pairs: await pairsForDexAddresses(configured) };

  try {
    const boosted = await discoverAddresses("token-boosts/top/v1");
    const pairs = await pairsForDexAddresses(boosted);
    if (pairs.length) return { source: "boosted" as const, pairs };
  } catch { /* Continue to profiles. */ }

  try {
    const profiles = await discoverAddresses("token-profiles/latest/v1");
    const pairs = await pairsForDexAddresses(profiles);
    if (pairs.length) return { source: "profiles" as const, pairs };
  } catch { /* Continue to deterministic search. */ }

  const payload = await fetchDexJson(`latest/dex/search?q=${encodeURIComponent(FALLBACK_QUERY)}`);
  return { source: "search" as const, pairs: asArray<RawPair>(payload?.pairs).slice(0, Math.max(limit * 3, limit)) };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = clampInteger(url.searchParams.get("limit"), DEFAULT_LIMIT, 1, 20);
  const query = url.searchParams.get("q")?.trim().slice(0, 100) || null;
  const requestAddresses = splitAddresses(url.searchParams.get("tokens"));
  const key = JSON.stringify({ limit, query, requestAddresses });
  const now = Date.now();
  const ttl = cacheMs();
  const existing = cache.get(key);

  if (existing && existing.expiresAt > now) {
    return Response.json({ ...existing.snapshot, cached: true }, {
      headers: { "Cache-Control": `public, max-age=${Math.floor(ttl / 1000)}, stale-while-revalidate=60` },
    });
  }

  try {
    const loaded = await loadMarkets(limit, query, requestAddresses);
    const markets = selectBestDexPairs(loaded.pairs, limit);
    if (!markets.length) throw new Error("DEX Screener returned no usable Solana pairs");
    const snapshot: DexMarketSnapshot = {
      ok: true,
      source: loaded.source,
      chainId: "solana",
      fetchedAt: now,
      cached: false,
      stale: false,
      refreshAfterMs: Math.max(ttl, 30_000),
      markets,
    };
    cache.set(key, { expiresAt: now + ttl, snapshot });
    return Response.json(snapshot, {
      headers: { "Cache-Control": `public, max-age=${Math.floor(ttl / 1000)}, stale-while-revalidate=60` },
    });
  } catch (error) {
    if (existing) {
      return Response.json({ ...existing.snapshot, cached: true, stale: true }, {
        headers: { "Cache-Control": "public, max-age=5, stale-while-revalidate=120", "X-Market-Data-Stale": "1" },
      });
    }
    const message = error instanceof Error ? error.message : "Unable to load market data";
    return Response.json({ ok: false, error: message }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
