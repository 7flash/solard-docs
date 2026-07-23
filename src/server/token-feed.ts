import { Buffer } from "buffer";
import { PublicKey } from "@solana/web3.js";
import { marketDatabase, type IndexedToken } from "../../shared/market-db";
import type { FeedToken, TokenFeedPayload } from "../types";
import { traceLabel } from "../observability/action";
import { serverMeasure } from "../observability/server";

const WSOL_MINT = "So11111111111111111111111111111111111111112";
const PUMPSWAP_PROGRAM = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const PUMPSWAP_POOL_DISC = Uint8Array.from([241, 154, 109, 4, 17, 177, 109, 188]);
const NEW_PAIR_MS = 6 * 60 * 60 * 1_000;
const MAX_FEED_TOKENS = 120;
const PRICE_REFRESH_LIMIT = 5;

type FeedPriority = {
  selected?: string[];
  open?: string[];
  visible?: string[];
  pinned?: string[];
};

type RpcAccount = {
  owner: string;
  lamports: number;
  data: Buffer;
};

type StaticPoolState = {
  baseDecimals: number;
  supplyRaw: bigint;
  virtualQuoteRaw: bigint;
  expiresAt: number;
};

type PriceState = {
  priceSol: number;
  marketCapSol: number;
  liquiditySol: number;
  marketCapUsd: number | null;
  liquidityUsd: number | null;
  baseReserveRaw: bigint;
  quoteReserveRaw: bigint;
  fetchedAt: number;
  stale: boolean;
};

class RpcGate {
  private tail: Promise<void> = Promise.resolve();
  private nextAt = 0;

  schedule<T>(work: () => Promise<T>): Promise<T> {
    const task = this.tail.catch(() => undefined).then(async () => {
      const rps = Math.max(
        1,
        Math.min(3, Math.floor(Number(process.env.SOLARD_SERVER_RPC_RPS ?? 3))),
      );
      const wait = Math.max(0, this.nextAt - Date.now());
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      this.nextAt = Date.now() + Math.ceil(1_000 / rps) + 10;
      return work();
    });
    this.tail = task.then(() => undefined, () => undefined);
    return task;
  }
}

const rpcGate = new RpcGate();
const staticPoolCache = new Map<string, StaticPoolState>();
const staticPoolInvalidUntil = new Map<string, number>();
const priceCache = new Map<string, PriceState>();
const priceInflight = new Map<string, Promise<PriceState>>();
let solUsdCache: { value: number | null; expiresAt: number } = { value: null, expiresAt: 0 };
let refreshCursor = 0;

function rpcUrl(): string {
  return process.env.SOLANA_RPC_URL ??
    process.env.PUBLIC_SOLANA_RPC_URL ??
    "https://api.mainnet-beta.solana.com";
}

async function getAccountInfo(address: string): Promise<RpcAccount | null> {
  return rpcGate.schedule(async () => {
    const response = await fetch(rpcUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `solard-${address.slice(0, 8)}-${Date.now()}`,
        method: "getAccountInfo",
        params: [address, { encoding: "base64", commitment: "confirmed" }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`RPC ${response.status}: ${body.slice(0, 240)}`);
    }
    const json = JSON.parse(body) as {
      error?: { code?: number; message?: string };
      result?: {
        value?: {
          owner?: string;
          lamports?: number;
          data?: [string, string];
        } | null;
      };
    };
    if (json.error) {
      throw new Error(
        `${json.error.code ?? "RPC"}: ${json.error.message ?? "request failed"}`,
      );
    }
    const value = json.result?.value;
    const encoded = Array.isArray(value?.data) ? value?.data[0] : null;
    if (!value || typeof value.owner !== "string" || typeof encoded !== "string")
      return null;
    return {
      owner: value.owner,
      lamports: Number(value.lamports ?? 0),
      data: Buffer.from(encoded, "base64"),
    };
  });
}

function readU64(data: Buffer, offset: number): bigint {
  if (data.length < offset + 8) throw new Error("account data is truncated");
  return data.readBigUInt64LE(offset);
}

function readI128(data: Buffer, offset: number): bigint {
  if (data.length < offset + 16) return 0n;
  let value = 0n;
  for (let index = 0; index < 16; index += 1)
    value |= BigInt(data[offset + index]!) << BigInt(index * 8);
  return value & (1n << 127n) ? value - (1n << 128n) : value;
}

function hasPrefix(data: Buffer, prefix: Uint8Array): boolean {
  if (data.length < prefix.length) return false;
  for (let index = 0; index < prefix.length; index += 1)
    if (data[index] !== prefix[index]) return false;
  return true;
}

function isSupportedTokenProgram(owner: string): boolean {
  return owner === TOKEN_PROGRAM || owner === TOKEN_2022_PROGRAM;
}

function tokenAmount(data: Buffer): bigint {
  // SPL Token account layout: mint[0..32], owner[32..64], amount u64 at 64.
  return readU64(data, 64);
}

function mintState(data: Buffer): { supply: bigint; decimals: number } {
  // Classic SPL Mint layout: supply u64 at 36 and decimals u8 at 44.
  if (data.length < 45) throw new Error("mint account is truncated");
  return { supply: readU64(data, 36), decimals: data[44]! };
}

async function getSolUsd(): Promise<number | null> {
  if (solUsdCache.expiresAt > Date.now()) return solUsdCache.value;
  try {
    const response = await fetch("https://api.coinbase.com/v2/prices/SOL-USD/spot", {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) throw new Error(`SOL/USD ${response.status}`);
    const json = (await response.json()) as { data?: { amount?: string } };
    const value = Number(json.data?.amount ?? 0);
    if (Number.isFinite(value) && value > 0) solUsdCache.value = value;
  } catch {
    // Retain the last valid conversion. Token/SOL prices remain usable without it.
  }
  solUsdCache.expiresAt = Date.now() + 60_000;
  return solUsdCache.value;
}

async function staticPoolState(token: IndexedToken): Promise<StaticPoolState> {
  const cached = staticPoolCache.get(token.mint);
  if (cached && cached.expiresAt > Date.now()) return cached;
  if ((staticPoolInvalidUntil.get(token.mint) ?? 0) > Date.now())
    throw new Error(`Pool ${token.pool} is temporarily excluded after failed validation.`);
  try {
    const [poolInfo, mintInfo] = await Promise.all([
      getAccountInfo(token.pool),
      getAccountInfo(token.mint),
    ]);
    if (
      !poolInfo ||
      poolInfo.owner !== PUMPSWAP_PROGRAM ||
      !hasPrefix(poolInfo.data, PUMPSWAP_POOL_DISC)
    ) throw new Error(`Indexed pool ${token.pool} is unavailable or invalid.`);
    if (!mintInfo || !isSupportedTokenProgram(mintInfo.owner))
      throw new Error(`Mint ${token.mint} is unavailable or uses an unsupported token program.`);
    if (poolInfo.data.length < 203)
      throw new Error(`Indexed pool ${token.pool} is truncated.`);
    const poolBaseMint = new PublicKey(poolInfo.data.subarray(43, 75)).toBase58();
    const poolQuoteMint = new PublicKey(poolInfo.data.subarray(75, 107)).toBase58();
    const poolBaseReserve = new PublicKey(poolInfo.data.subarray(139, 171)).toBase58();
    const poolQuoteReserve = new PublicKey(poolInfo.data.subarray(171, 203)).toBase58();
    if (
      poolBaseMint !== token.mint ||
      poolQuoteMint !== WSOL_MINT ||
      poolBaseReserve !== token.pool_base_token ||
      poolQuoteReserve !== token.pool_quote_token
    ) throw new Error(`Indexed pool ${token.pool} does not match its migration accounts.`);
    const mint = mintState(mintInfo.data);
    const value: StaticPoolState = {
      baseDecimals: mint.decimals,
      supplyRaw: mint.supply,
      virtualQuoteRaw: readI128(poolInfo.data, 245),
      expiresAt: Date.now() + 10 * 60_000,
    };
    staticPoolCache.set(token.mint, value);
    staticPoolInvalidUntil.delete(token.mint);
    return value;
  } catch (error) {
    staticPoolInvalidUntil.set(token.mint, Date.now() + 15_000);
    throw error;
  }
}

async function refreshPrice(token: IndexedToken): Promise<PriceState> {
  const existing = priceInflight.get(token.mint);
  if (existing) return existing;
  const work = serverMeasure(
    traceLabel("Refresh indexed PumpSwap price", {
      mint: token.mint,
      pool: token.pool,
    }),
    async () => {
      const staticState = await staticPoolState(token);
      const [baseInfo, quoteInfo, solUsd] = await Promise.all([
        getAccountInfo(token.pool_base_token),
        getAccountInfo(token.pool_quote_token),
        getSolUsd(),
      ]);
      if (!baseInfo || !quoteInfo) throw new Error("Pool reserve account is missing.");
      if (!isSupportedTokenProgram(baseInfo.owner) || !isSupportedTokenProgram(quoteInfo.owner))
        throw new Error("Pool reserve uses an unsupported token program.");
      const baseReserveMint = new PublicKey(baseInfo.data.subarray(0, 32)).toBase58();
      const quoteReserveMint = new PublicKey(quoteInfo.data.subarray(0, 32)).toBase58();
      if (baseReserveMint !== token.mint || quoteReserveMint !== WSOL_MINT)
        throw new Error("Pool reserve mint mismatch.");
      const baseRaw = tokenAmount(baseInfo.data);
      const quoteRaw = tokenAmount(quoteInfo.data);
      const effectiveQuote =
        quoteRaw +
        (staticState.virtualQuoteRaw > 0n ? staticState.virtualQuoteRaw : 0n);
      const baseUi = Number(baseRaw) / 10 ** staticState.baseDecimals;
      const quoteUi = Number(effectiveQuote) / 1_000_000_000;
      if (!(baseUi > 0) || !(quoteUi > 0))
        throw new Error("Pool reserves cannot produce a valid price.");
      const priceSol = quoteUi / baseUi;
      if (!Number.isFinite(priceSol) || priceSol <= 0)
        throw new Error("Pool reserves produced an invalid price.");
      const supplyUi = Number(staticState.supplyRaw) / 10 ** staticState.baseDecimals;
      const marketCapSol = priceSol * supplyUi;
      const liquiditySol = quoteUi * 2;
      if (!Number.isFinite(marketCapSol) || marketCapSol <= 0)
        throw new Error("Pool state cannot produce a valid SOL market cap.");
      if (!Number.isFinite(liquiditySol) || liquiditySol <= 0)
        throw new Error("Pool state cannot produce valid SOL liquidity.");
      const marketCapUsd =
        solUsd != null ? marketCapSol * solUsd : null;
      const liquidityUsd = solUsd != null ? liquiditySol * solUsd : null;
      const value: PriceState = {
        priceSol,
        marketCapSol,
        liquiditySol,
        marketCapUsd:
          marketCapUsd != null && Number.isFinite(marketCapUsd)
            ? marketCapUsd
            : null,
        liquidityUsd:
          liquidityUsd != null && Number.isFinite(liquidityUsd)
            ? liquidityUsd
            : null,
        baseReserveRaw: baseRaw,
        quoteReserveRaw: effectiveQuote,
        fetchedAt: Date.now(),
        stale: false,
      };
      priceCache.set(token.mint, value);
      return value;
    },
  ).finally(() => priceInflight.delete(token.mint));
  priceInflight.set(token.mint, work);
  return work;
}

function unique(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).filter(Boolean))];
}

function refreshPlan(tokens: IndexedToken[], priority: FeedPriority): IndexedToken[] {
  const byMint = new Map(tokens.map((token) => [token.mint, token]));
  const now = Date.now();
  const planned: IndexedToken[] = [];
  const add = (mints: string[], ttl: number) => {
    for (const mint of mints) {
      const token = byMint.get(mint);
      const cached = priceCache.get(mint);
      const excluded = (staticPoolInvalidUntil.get(mint) ?? 0) > now;
      if (token && !excluded && (!cached || now - cached.fetchedAt >= ttl))
        planned.push(token);
    }
  };
  add(unique(priority.selected), 5_000);
  add(unique(priority.open), 8_000);
  add(unique(priority.visible), 15_000);
  add(unique(priority.pinned), 30_000);

  // A just-indexed migration must not wait behind seeded or older markets.
  // Warm the newest uncached pools first, then continue round-robin refreshes.
  if (planned.length < PRICE_REFRESH_LIMIT) {
    const newestUncached = tokens
      .filter((token) => !priceCache.has(token.mint))
      .sort(
        (left, right) =>
          (right.migrated_at_ms ?? 0) - (left.migrated_at_ms ?? 0) ||
          (right.migration_slot ?? 0) - (left.migration_slot ?? 0),
      );
    for (const token of newestUncached) {
      const excluded = (staticPoolInvalidUntil.get(token.mint) ?? 0) > now;
      if (!excluded) planned.push(token);
      if (planned.length >= PRICE_REFRESH_LIMIT) break;
    }
  }

  // Continue through stale cached markets without blocking the response on all rows.
  if (planned.length < PRICE_REFRESH_LIMIT && tokens.length > 0) {
    for (let offset = 0; offset < tokens.length; offset += 1) {
      const token = tokens[(refreshCursor + offset) % tokens.length]!;
      const cached = priceCache.get(token.mint);
      const excluded = (staticPoolInvalidUntil.get(token.mint) ?? 0) > now;
      if (!excluded && (!cached || now - cached.fetchedAt >= 30_000)) {
        planned.push(token);
        refreshCursor = (refreshCursor + offset + 1) % tokens.length;
        if (planned.length >= PRICE_REFRESH_LIMIT) break;
      }
    }
  }
  return [...new Map(planned.map((token) => [token.mint, token])).values()].slice(
    0,
    PRICE_REFRESH_LIMIT,
  );
}

function feedToken(token: IndexedToken): FeedToken {
  const price = priceCache.get(token.mint);
  const priceSol = price?.priceSol ?? null;
  const solUsd = solUsdCache.value;
  return {
    mint: token.mint,
    pairAddress: token.pool,
    poolBaseToken: token.pool_base_token,
    poolQuoteToken: token.pool_quote_token,
    quoteMint: token.quote_mint,
    baseDecimals: staticPoolCache.get(token.mint)?.baseDecimals ?? 6,
    symbol: token.symbol || token.mint.slice(0, 6),
    name: token.name || token.symbol || token.mint,
    imageUrl: token.image_url,
    dexId: "pumpswap",
    quoteSymbol: "SOL",
    url: `https://solscan.io/account/${token.pool}`,
    priceUsd: priceSol != null && solUsd != null ? priceSol * solUsd : null,
    priceNative: priceSol,
    marketCap: price?.marketCapUsd ?? null,
    fdv: price?.marketCapUsd ?? null,
    liquidityUsd: price?.liquidityUsd ?? null,
    marketCapSol: price?.marketCapSol ?? null,
    liquiditySol: price?.liquiditySol ?? null,
    pairCreatedAt: token.migrated_at_ms ?? token.created_at_ms ?? 0,
    tokenCreatedAt: token.created_at_ms > 0 ? token.created_at_ms : null,
    newPair:
      token.migrated_at_ms != null &&
      Date.now() - token.migrated_at_ms < NEW_PAIR_MS,
    migrated: true,
    activePerp: true,
    marketAddress: token.pool,
    maxLeverage: 25,
    paused: false,
    settlementMode: false,
    source: "onchain",
    seeded: token.seed_rank != null,
    seedRank: token.seed_rank,
  };
}

export async function getTokenFeed(
  priority: FeedPriority = {},
): Promise<TokenFeedPayload> {
  const database = marketDatabase();
  const tokens = database.listMigratedTokens(MAX_FEED_TOKENS);
  const requested = unique([
    ...(priority.selected ?? []),
    ...(priority.open ?? []),
    ...(priority.pinned ?? []),
  ]);
  const byMint = new Map(tokens.map((token) => [token.mint, token]));
  for (const mint of requested) {
    if (byMint.has(mint)) continue;
    const token = database.findMigratedToken(mint);
    if (token) {
      tokens.push(token);
      byMint.set(mint, token);
    }
  }
  const plan = refreshPlan(tokens, priority);
  const refreshes = await Promise.allSettled(plan.map((token) => refreshPrice(token)));
  const failures = refreshes.filter((result) => result.status === "rejected");
  const warning = failures.length
    ? `${failures.length} prioritized price refresh${failures.length === 1 ? "" : "es"} failed; cached values retained.`
    : undefined;
  const readyTokens = tokens.filter((token) => priceCache.has(token.mint));
  return {
    // A market enters the terminal only after a real reserve snapshot has
    // produced price, market cap and liquidity. This avoids empty metric cells
    // without inventing values; failed reads remain queued for retry.
    tokens: readyTokens.map(feedToken),
    updatedAt: Date.now(),
    source: "SQD Pump migrate index + shared SQLite + cached reserve prices",
    ...(warning ? { warning } : {}),
  };
}

export async function getPumpSwapTokenByMint(
  mint: string,
): Promise<FeedToken | null> {
  const token = marketDatabase().findMigratedToken(mint);
  if (!token) return null;
  try {
    await refreshPrice(token);
  } catch {
    // A previously cached reserve snapshot remains usable; otherwise the mint
    // stays out of the terminal until a real price can be read.
  }
  return priceCache.has(token.mint) ? feedToken(token) : null;
}

export async function searchPumpSwapTokens(
  query: string,
  limit = 12,
): Promise<FeedToken[]> {
  const matches = marketDatabase().searchMigratedTokens(query, limit);
  if (matches.length === 0) return [];
  // Search is interactive, so prioritize the matching pools immediately. Only
  // return rows backed by a real reserve snapshot; no blank metric result is
  // introduced into the terminal by search.
  await Promise.allSettled(
    matches.slice(0, PRICE_REFRESH_LIMIT).map((token) => refreshPrice(token)),
  );
  return matches
    .filter((token) => priceCache.has(token.mint))
    .map(feedToken)
    .slice(0, limit);
}

