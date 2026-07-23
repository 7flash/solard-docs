/**
 * SQD indexer for the SOLARD trade app.
 *
 * It follows one live SQD cursor containing all required instruction families:
 * - Pump create/create_v2: token name, symbol and metadata URI
 * - Pump migrate: canonical WSOL PumpSwap pool and reserve accounts
 * - SOLARD open_position/close_position: current positions and public history
 *
 * The browser never scans programs or discovers pools. The TradJS server reads
 * the same SQLite file through shared/market-db.ts.
 *
 * Run:
 *   bun run sqd/migrated-pumpswap.ts
 *
 * Environment:
 *   SOLARD_DB_PATH=./solard.db
 *   PORTAL_URL=https://portal.sqd.dev/datasets/solana-mainnet
 *   SQD_MARKET_FINALIZED=0       # default hot stream; set 1 for delayed finalized-only
 *   SQD_LIVE_LOOKBACK=2000       # only recent live catch-up; no history replay
 *   METADATA_CONCURRENCY=2
 */
import { Buffer } from "buffer";
import { PublicKey } from "@solana/web3.js";
import {
  getPortalHead,
  measure,
  type PortalBlock,
  type PortalInstruction,
  type PortalQuery,
  runPortal,
  timestampMs,
  transactionMap,
} from "./shared/portal.ts";
import { base58Decode, PUMP_PROGRAM } from "./monitor/pump-decode.ts";
import { marketDatabase, type PendingToken } from "../shared/market-db.ts";

const PUMP_MIGRATE_D8 = "0x9beae792ec9ea21e";
const PUMP_MIGRATE_DISC = Uint8Array.from([
  155, 234, 231, 146, 236, 158, 162, 30,
]);
const SOLARD_PROGRAM =
  process.env.PUBLIC_PROGRAM_ID ??
  process.env.SOLARD_PROGRAM_ID ??
  "5cvRkbFXRozP2tZ9VW3xk3HCYZxcojsL69Lq2qzeSLRD";
const OPEN_POSITION_D8 = "0x87802f4d0f98f031";
const CLOSE_POSITION_D8 = "0x7b86510031446262";
const OPEN_POSITION_DISC = Uint8Array.from([
  135, 128, 47, 77, 15, 152, 240, 49,
]);
const CLOSE_POSITION_DISC = Uint8Array.from([123, 134, 81, 0, 49, 68, 98, 98]);
const POSITION_ACCOUNT_DISC = Uint8Array.from([
  170, 188, 143, 228, 122, 64, 247, 208,
]);
const WSOL_MINT = "So11111111111111111111111111111111111111112";
const TOKEN_METADATA_PROGRAM = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
);
const PUMPSWAP_PROGRAM = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";
const PUMPSWAP_POOL_DISC = Uint8Array.from([
  241, 154, 109, 4, 17, 177, 109, 188,
]);
const LIVE_STREAM = "sqd:v4:hot-live";

const SEEDED_MARKETS = [
  {
    name: "SOLARD",
    symbol: "SOLARD",
    mint: "47M2U1eVot6VPWjcqEFWe2CesUTBGBXfSDovaqTmpump",
    pool: "33zaVxn4PGUtQq4BmViKSxZ8UatMz3kVdFxb1JeFHMXS",
    seedRank: 1,
  },
  {
    name: "ANSEM",
    symbol: "ANSEM",
    mint: "9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump",
    pool: "FnzKY6x7entQ1eR3D225dQyT7ybfka4PskBMQhb8L3CC",
    seedRank: 2,
  },
  {
    name: "FARTCOIN",
    symbol: "FARTCOIN",
    mint: "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump",
    pool: "EEv8MvhuqiKSmYFaYzDQJaxMUCzWP3XjmaFDG2QZEshR",
    seedRank: 3,
  },
] as const;

const MIGRATE_ACCOUNTS = {
  mint: 2,
  pool: 9,
  poolAuthority: 10,
  lpMint: 15,
  poolBaseToken: 17,
  poolQuoteToken: 18,
  wsolMint: 14,
  minimum: 25,
} as const;

const OPEN_ACCOUNTS = {
  owner: 0,
  pool: 2,
  baseMint: 5,
  position: 9,
  minimum: 12,
} as const;

const CLOSE_ACCOUNTS = {
  owner: 0,
  pool: 3,
  baseMint: 6,
  position: 7,
  minimum: 12,
} as const;

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length < right.length) return false;
  for (let index = 0; index < right.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function instructionAddress(value: number[] | undefined): string {
  return Array.isArray(value) ? value.join(".") : "";
}

function readU64(data: Uint8Array, offset: number): bigint {
  if (data.length < offset + 8)
    throw new Error("instruction data is truncated");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return view.getBigUint64(offset, true);
}

function readU32(data: Uint8Array, offset: number): number {
  if (data.length < offset + 4)
    throw new Error("instruction data is truncated");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return view.getUint32(offset, true);
}

function requiredAccount(
  instruction: PortalInstruction,
  index: number,
  label: string,
): string {
  const value = instruction.accounts?.[index];
  if (!value) throw new Error(`missing ${label} account at index ${index}`);
  return value;
}

function gatewayCandidates(value: string | null | undefined): string[] {
  const raw = value?.trim();
  if (!raw) return [];
  const candidates: string[] = [];
  const add = (url: string) => {
    if (!candidates.includes(url)) candidates.push(url);
  };
  const addIpfs = (path: string) => {
    const clean = path.replace(/^ipfs\//, "").replace(/^\/+/, "");
    if (!clean) return;
    add(`https://cloudflare-ipfs.com/ipfs/${clean}`);
    add(`https://dweb.link/ipfs/${clean}`);
    add(`https://gateway.pinata.cloud/ipfs/${clean}`);
    add(`https://ipfs.io/ipfs/${clean}`);
  };

  if (raw.startsWith("ipfs://")) {
    addIpfs(raw.slice("ipfs://".length));
    return candidates;
  }
  if (raw.startsWith("ar://")) {
    add(`https://arweave.net/${raw.slice(5)}`);
    return candidates;
  }

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return [];
    add(url.toString());
    const match = url.pathname.match(/\/ipfs\/(.+)$/);
    if (match?.[1]) addIpfs(match[1]);
  } catch {
    return [];
  }
  return candidates;
}

function normalizeGatewayUrl(value: string | null | undefined): string | null {
  return gatewayCandidates(value)[0] ?? null;
}

async function fetchJsonCandidates(
  values: string[],
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  let lastError: unknown = new Error("metadata URL is unavailable");
  for (const url of values) {
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json" },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok)
        throw new Error(`${response.status} ${response.statusText}`);
      const value = await response.json();
      if (!value || typeof value !== "object")
        throw new Error("metadata is not an object");
      return value as Record<string, unknown>;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function resolveRealImageUrl(
  value: string | null | undefined,
  timeoutMs: number,
): Promise<string | null> {
  for (const url of gatewayCandidates(value)) {
    try {
      const response = await fetch(url, {
        headers: { accept: "image/*" },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      const type = (response.headers.get("content-type") || "").toLowerCase();
      const validType =
        type.startsWith("image/") || type.includes("octet-stream");
      await response.body?.cancel().catch(() => undefined);
      if (response.ok && validType) return response.url || url;
    } catch {
      // Try the next gateway. No placeholder is ever stored.
    }
  }
  return null;
}

type PumpCoinMetadata = {
  name?: unknown;
  symbol?: unknown;
  metadata_uri?: unknown;
  image_uri?: unknown;
  created_timestamp?: unknown;
};

function realTimestampMs(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const milliseconds = numeric < 100_000_000_000 ? numeric * 1_000 : numeric;
  return Number.isSafeInteger(Math.trunc(milliseconds))
    ? Math.trunc(milliseconds)
    : null;
}

async function fetchPumpCoinMetadata(
  mint: string,
  timeoutMs: number,
): Promise<PumpCoinMetadata | null> {
  const endpoints = [
    `https://frontend-api-v3.pump.fun/coins-v2/${mint}`,
    `https://frontend-api-v3.pump.fun/coins/${mint}`,
  ];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        headers: { accept: "application/json" },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) continue;
      const json = await response.json();
      const record = Array.isArray(json) ? json[0] : json;
      if (record && typeof record === "object")
        return record as PumpCoinMetadata;
    } catch {
      // On-chain metadata remains the primary source; this is only a server-side fallback.
    }
  }
  return null;
}

async function applyPumpCoinMetadata(
  mint: string,
  timeoutMs: number,
): Promise<boolean> {
  const coin = await fetchPumpCoinMetadata(mint, timeoutMs);
  if (!coin) return false;
  const name = typeof coin.name === "string" ? coin.name.trim() : undefined;
  const symbol =
    typeof coin.symbol === "string" ? coin.symbol.trim() : undefined;
  const metadataUri =
    typeof coin.metadata_uri === "string" ? coin.metadata_uri.trim() : "";
  const createdAtMs = realTimestampMs(coin.created_timestamp);
  if (createdAtMs !== null)
    marketDatabase().updateTokenCreatedAt(mint, createdAtMs);
  if (metadataUri)
    marketDatabase().updateMetadataSource(mint, metadataUri, name, symbol);
  const image = await resolveRealImageUrl(
    typeof coin.image_uri === "string" ? coin.image_uri : null,
    timeoutMs,
  );
  if (!image) return false;
  marketDatabase().updateMetadata(mint, image, name, symbol);
  return true;
}

async function fetchMetadata(token: PendingToken): Promise<void> {
  const timeoutMs = Math.max(
    1_000,
    Number(process.env.METADATA_TIMEOUT_MS ?? 8_000),
  );
  let metadata: Record<string, unknown> | null = null;
  const candidates = gatewayCandidates(token.metadata_uri);
  if (candidates.length > 0) {
    try {
      metadata = await fetchJsonCandidates(candidates, timeoutMs);
    } catch {
      metadata = null;
    }
  }

  if (metadata) {
    const name =
      typeof metadata.name === "string" ? metadata.name.trim() : undefined;
    const symbol =
      typeof metadata.symbol === "string" ? metadata.symbol.trim() : undefined;
    const sourceUrl = await resolveRealImageUrl(
      typeof metadata.image === "string" ? metadata.image : null,
      timeoutMs,
    );
    if (sourceUrl) {
      marketDatabase().updateMetadata(token.mint, sourceUrl, name, symbol);
      return;
    }
  }

  if (await applyPumpCoinMetadata(token.mint, timeoutMs)) return;
  throw new Error("real token image could not be resolved from metadata");
}

let metadataWorkerRunning = false;
async function enrichMetadata(): Promise<void> {
  if (metadataWorkerRunning) return;
  metadataWorkerRunning = true;
  try {
    const concurrency = Math.max(
      1,
      Math.min(4, Number(process.env.METADATA_CONCURRENCY ?? 2)),
    );
    const queue = marketDatabase().metadataQueue(concurrency * 4);
    let cursor = 0;
    const workers = Array.from({ length: concurrency }, async () => {
      while (cursor < queue.length) {
        const token = queue[cursor++];
        if (!token) return;
        try {
          await fetchMetadata(token);
          console.log(
            `[sqd-index] metadata ${token.symbol || token.mint.slice(0, 8)} image URL indexed`,
          );
        } catch (error) {
          marketDatabase().updateMetadata(token.mint, null);
          console.warn(
            `[sqd-index] metadata ${token.mint.slice(0, 8)}… ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    });
    await Promise.all(workers);
  } finally {
    metadataWorkerRunning = false;
  }
}

let hydrationTail: Promise<void> = Promise.resolve();
let nextHydrationAt = 0;

function scheduleHydration(label: string, work: () => Promise<void>): void {
  hydrationTail = hydrationTail
    .catch(() => undefined)
    .then(async () => {
      const wait = Math.max(0, nextHydrationAt - Date.now());
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      nextHydrationAt = Date.now() + 1_000;
      await work();
    })
    .catch((error) => {
      console.warn(
        `[sqd-index] ${label} ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    });
}

function rpcEndpoint(): string {
  return (
    process.env.SOLANA_RPC_URL ??
    process.env.PUBLIC_SOLANA_RPC_URL ??
    "https://api.mainnet-beta.solana.com"
  );
}

type RpcAccountInfo = { owner: string; data: Uint8Array };

class IndexerRpcGate {
  private tail: Promise<void> = Promise.resolve();
  private nextAt = 0;

  schedule<T>(work: () => Promise<T>): Promise<T> {
    const task = this.tail
      .catch(() => undefined)
      .then(async () => {
        const rps = Math.max(
          1,
          Math.min(
            2,
            Math.floor(Number(process.env.SOLARD_INDEXER_RPC_RPS ?? 1)),
          ),
        );
        const wait = Math.max(0, this.nextAt - Date.now());
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
        this.nextAt = Date.now() + Math.ceil(1_000 / rps) + 10;
        return work();
      });
    this.tail = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }
}

const indexerRpcGate = new IndexerRpcGate();

async function rpcAccountInfo(address: string): Promise<RpcAccountInfo | null> {
  return indexerRpcGate.schedule(async () => {
    const response = await fetch(rpcEndpoint(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `index-${address.slice(0, 8)}`,
        method: "getAccountInfo",
        params: [address, { encoding: "base64", commitment: "confirmed" }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`RPC ${response.status}`);
    const json = (await response.json()) as {
      result?: { value?: { owner?: string; data?: [string, string] } | null };
      error?: { message?: string };
    };
    if (json.error) throw new Error(json.error.message ?? "RPC failed");
    const value = json.result?.value;
    const encoded = Array.isArray(value?.data) ? value?.data[0] : null;
    return value && typeof value.owner === "string" && encoded
      ? {
          owner: value.owner,
          data: Uint8Array.from(Buffer.from(encoded, "base64")),
        }
      : null;
  });
}

async function rpcAccount(address: string): Promise<Uint8Array | null> {
  return (await rpcAccountInfo(address))?.data ?? null;
}

function poolPublicKey(data: Uint8Array, offset: number): string {
  if (data.length < offset + 32)
    throw new Error("PumpSwap pool account is truncated");
  return new PublicKey(data.subarray(offset, offset + 32)).toBase58();
}

let seedWorkerRunning = false;
async function seedKnownMarkets(): Promise<void> {
  if (process.env.SOLARD_SEED_MARKETS === "0" || seedWorkerRunning) return;
  seedWorkerRunning = true;
  const db = marketDatabase();
  try {
    for (const seed of SEEDED_MARKETS) {
      try {
        const account = await rpcAccountInfo(seed.pool);
        if (!account || account.owner !== PUMPSWAP_PROGRAM)
          throw new Error(
            "pool account is missing or owned by another program",
          );
        if (!sameBytes(account.data, PUMPSWAP_POOL_DISC))
          throw new Error("account is not a PumpSwap Pool");
        const baseMint = poolPublicKey(account.data, 43);
        const quoteMint = poolPublicKey(account.data, 75);
        if (baseMint !== seed.mint || quoteMint !== WSOL_MINT)
          throw new Error(
            `pool mint mismatch base=${baseMint} quote=${quoteMint}`,
          );
        db.upsertSeedMarket({
          mint: seed.mint,
          name: seed.name,
          symbol: seed.symbol,
          pool: seed.pool,
          lpMint: poolPublicKey(account.data, 107),
          poolBaseToken: poolPublicKey(account.data, 139),
          poolQuoteToken: poolPublicKey(account.data, 171),
          quoteMint,
          seedRank: seed.seedRank,
        });
        enqueueMintMetadataHydration(seed.mint);
        console.log(
          `[sqd-index] seeded ${seed.symbol} pool=${seed.pool.slice(0, 8)}…`,
        );
      } catch (error) {
        console.warn(
          `[sqd-index] seed ${seed.symbol} pending retry: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  } finally {
    seedWorkerRunning = false;
  }
}

function enqueuePositionHydration(positionPda: string): void {
  scheduleHydration(
    `position hydrate ${positionPda.slice(0, 8)}…`,
    async () => {
      const data = await rpcAccount(positionPda);
      if (!data || !sameBytes(data, POSITION_ACCOUNT_DISC) || data.length < 138)
        return;
      const side = data[104] === 1 ? "short" : "long";
      marketDatabase().hydratePosition({
        positionPda,
        side,
        collateralAmount: readU64(data, 105),
        notionalAmount: readU64(data, 113),
        entryPriceE6: readU64(data, 121),
        openedSlot: readU64(data, 129),
      });
    },
  );
}

function readBorshString(data: Uint8Array, state: { offset: number }): string {
  if (data.length < state.offset + 4)
    throw new Error("metadata string is truncated");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const length = view.getUint32(state.offset, true);
  state.offset += 4;
  if (length > 10_000 || data.length < state.offset + length)
    throw new Error("invalid metadata string length");
  const value = new TextDecoder().decode(
    data.subarray(state.offset, state.offset + length),
  );
  state.offset += length;
  return value.replace(/\0/g, "").trim();
}

function enqueueMintMetadataHydration(mint: string): void {
  if (!marketDatabase().needsTokenHydration(mint)) return;
  scheduleHydration(`metadata source ${mint.slice(0, 8)}…`, async () => {
    try {
      const mintKey = new PublicKey(mint);
      const [metadataPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata"),
          TOKEN_METADATA_PROGRAM.toBuffer(),
          mintKey.toBuffer(),
        ],
        TOKEN_METADATA_PROGRAM,
      );
      const data = await rpcAccount(metadataPda.toBase58());
      if (data && data.length >= 65) {
        const state = { offset: 65 };
        const name = readBorshString(data, state);
        const symbol = readBorshString(data, state);
        const uri = readBorshString(data, state);
        if (uri) {
          marketDatabase().updateMetadataSource(mint, uri, name, symbol);
        }
      }
    } catch {
      // Pump's backend fallback below handles unavailable or non-Metaplex metadata.
    }

    const timeoutMs = Math.max(
      1_000,
      Number(process.env.METADATA_TIMEOUT_MS ?? 8_000),
    );
    // Pump's API supplies the actual token creation timestamp and is also a
    // fallback for metadata/image fields. No synthetic timestamp is written.
    await applyPumpCoinMetadata(mint, timeoutMs).catch(() => false);
  });
}

function queryFields() {
  return {
    block: {
      number: true,
      hash: true,
      parentNumber: true,
      parentHash: true,
      height: true,
      timestamp: true,
    },
    transaction: {
      transactionIndex: true,
      signatures: true,
      err: true,
    },
    instruction: {
      transactionIndex: true,
      instructionAddress: true,
      programId: true,
      accounts: true,
      data: true,
      isCommitted: true,
    },
  };
}

function buildLiveQuery(cursor: number): PortalQuery {
  return {
    type: "solana",
    fromBlock: cursor,
    fields: queryFields(),
    instructions: [
      {
        programId: [PUMP_PROGRAM],
        d8: [PUMP_MIGRATE_D8],
        isCommitted: true,
        transaction: true,
      },
      {
        programId: [SOLARD_PROGRAM],
        d8: [OPEN_POSITION_D8, CLOSE_POSITION_D8],
        isCommitted: true,
        transaction: true,
      },
    ],
  };
}

function processPumpInstruction(
  block: PortalBlock,
  instruction: PortalInstruction,
  signature: string,
  finalized: boolean,
): boolean {
  if (!instruction.data) return false;
  const data = base58Decode(instruction.data);
  const when = timestampMs(block.header.timestamp);

  if (!sameBytes(data, PUMP_MIGRATE_DISC)) return false;
  if (
    !instruction.accounts ||
    instruction.accounts.length < MIGRATE_ACCOUNTS.minimum
  )
    throw new Error(
      "Pump migrate account list is shorter than the current IDL",
    );
  const quoteMint = requiredAccount(
    instruction,
    MIGRATE_ACCOUNTS.wsolMint,
    "WSOL mint",
  );
  if (quoteMint !== WSOL_MINT) return false;
  const mint = requiredAccount(instruction, MIGRATE_ACCOUNTS.mint, "mint");
  const pool = requiredAccount(instruction, MIGRATE_ACCOUNTS.pool, "pool");
  marketDatabase().upsertMigration({
    mint,
    pool,
    poolAuthority: requiredAccount(
      instruction,
      MIGRATE_ACCOUNTS.poolAuthority,
      "pool authority",
    ),
    poolBaseToken: requiredAccount(
      instruction,
      MIGRATE_ACCOUNTS.poolBaseToken,
      "pool base reserve",
    ),
    poolQuoteToken: requiredAccount(
      instruction,
      MIGRATE_ACCOUNTS.poolQuoteToken,
      "pool quote reserve",
    ),
    quoteMint,
    lpMint: requiredAccount(instruction, MIGRATE_ACCOUNTS.lpMint, "LP mint"),
    signature,
    slot: block.header.number,
    timestampMs: when,
    finalized,
  });
  enqueueMintMetadataHydration(mint);
  console.log(
    `[sqd-index] migrated ${mint.slice(0, 8)}… pool=${pool.slice(0, 8)}… slot=${block.header.number}`,
  );
  return true;
}

function processSolardInstruction(
  block: PortalBlock,
  instruction: PortalInstruction,
  signature: string,
): boolean {
  if (!instruction.data) return false;
  const data = base58Decode(instruction.data);
  const address = instructionAddress(instruction.instructionAddress);
  const id = `${signature}:${address}`;
  const when = timestampMs(block.header.timestamp);

  if (sameBytes(data, OPEN_POSITION_DISC)) {
    if (
      !instruction.accounts ||
      instruction.accounts.length < OPEN_ACCOUNTS.minimum
    )
      throw new Error(
        "open_position account list is shorter than the current IDL",
      );
    const sideByte = data[20];
    if (sideByte !== 0 && sideByte !== 1)
      throw new Error(`invalid Side variant ${sideByte}`);
    marketDatabase().recordOpenPosition({
      id,
      signature,
      instructionAddress: address,
      owner: requiredAccount(instruction, OPEN_ACCOUNTS.owner, "owner"),
      positionPda: requiredAccount(
        instruction,
        OPEN_ACCOUNTS.position,
        "position",
      ),
      baseMint: requiredAccount(
        instruction,
        OPEN_ACCOUNTS.baseMint,
        "base mint",
      ),
      pool: requiredAccount(instruction, OPEN_ACCOUNTS.pool, "pool"),
      collateralAmount: readU64(data, 8),
      leverageBps: readU32(data, 16),
      side: sideByte === 0 ? "long" : "short",
      priceLimitE6: readU64(data, 21),
      slot: block.header.number,
      timestampMs: when,
    });
    enqueuePositionHydration(
      requiredAccount(instruction, OPEN_ACCOUNTS.position, "position"),
    );
    return true;
  }

  if (sameBytes(data, CLOSE_POSITION_DISC)) {
    if (
      !instruction.accounts ||
      instruction.accounts.length < CLOSE_ACCOUNTS.minimum
    )
      throw new Error(
        "close_position account list is shorter than the current IDL",
      );
    marketDatabase().recordClosePosition({
      id,
      signature,
      instructionAddress: address,
      owner: requiredAccount(instruction, CLOSE_ACCOUNTS.owner, "owner"),
      positionPda: requiredAccount(
        instruction,
        CLOSE_ACCOUNTS.position,
        "position",
      ),
      baseMint: requiredAccount(
        instruction,
        CLOSE_ACCOUNTS.baseMint,
        "base mint",
      ),
      pool: requiredAccount(instruction, CLOSE_ACCOUNTS.pool, "pool"),
      minPayout: readU64(data, 8),
      slot: block.header.number,
      timestampMs: when,
    });
    return true;
  }
  return false;
}

async function processLiveBlock(
  block: PortalBlock,
  finalized: boolean,
): Promise<void> {
  const transactions = transactionMap(block);
  for (const instruction of block.instructions ?? []) {
    if (instruction.isCommitted === false) continue;
    const transaction = transactions.get(instruction.transactionIndex);
    if (!transaction || transaction.err) continue;
    const signature = transaction.signatures?.[0];
    if (!signature) continue;
    try {
      if (instruction.programId === PUMP_PROGRAM) {
        processPumpInstruction(block, instruction, signature, finalized);
      } else if (instruction.programId === SOLARD_PROGRAM) {
        processSolardInstruction(block, instruction, signature);
      }
    } catch (error) {
      console.warn(
        `[sqd-index] skip ${signature.slice(0, 12)}… ix=${instructionAddress(instruction.instructionAddress)} ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

function liveStart(
  checkpoint: { nextSlot: number } | null,
  head: number,
  lookback: number,
): number {
  const floor = Math.max(0, head - lookback);
  if (!checkpoint) return floor;
  if (checkpoint.nextSlot < floor || checkpoint.nextSlot > head + 1) {
    console.warn(
      `[sqd-index] ignoring stale live checkpoint=${checkpoint.nextSlot}; ` +
        `starting at ${floor} near head=${head}`,
    );
    return floor;
  }
  return checkpoint.nextSlot;
}

async function main(): Promise<void> {
  const db = marketDatabase();
  const portal =
    process.env.PORTAL_URL ?? "https://portal.sqd.dev/datasets/solana-mainnet";
  // The terminal needs migrations as they happen. Use SQD hot stream by
  // default; reorg rollback below keeps provisional rows consistent. The old
  // SQD_FINALIZED variable is intentionally ignored so a stale .env cannot
  // silently put the market feed 10–20 minutes behind.
  const finalized = process.env.SQD_MARKET_FINALIZED === "1";
  const head = await getPortalHead(portal, finalized);

  await seedKnownMarkets();

  const lookback = Math.max(
    250,
    Number(process.env.SQD_LIVE_LOOKBACK ?? 2_000),
  );
  const floor = Math.max(0, head.number - lookback);
  const from = liveStart(db.checkpoint(LIVE_STREAM), head.number, lookback);
  const pruned =
    process.env.SQD_KEEP_HISTORICAL_POOLS === "1"
      ? 0
      : db.pruneUnseededPoolsBeforeSlot(floor);
  if (pruned > 0) {
    console.log(
      `[sqd-index] pruned ${pruned} stale non-seed pool(s) before slot ${floor}`,
    );
  }

  console.log(
    `[sqd-index] live head=${head.number} from=${from} mode=${finalized ? "finalized" : "hot"} ` +
      `db=${process.env.SOLARD_DB_PATH ?? "./solard.db"}`,
  );

  const metadataTimer = setInterval(() => void enrichMetadata(), 2_000);
  const seedTimer = setInterval(() => void seedKnownMarkets(), 60_000);
  const databaseTimer = setInterval(() => {
    const status = db.indexSummary();
    console.log(
      `[sqd-index] db pools=${status.pools} ready=${status.readyMarkets} ` +
        `pendingMetadata=${status.pendingMetadata} openPositions=${status.openPositions}`,
    );
  }, 10_000);
  (metadataTimer as any).unref?.();
  (seedTimer as any).unref?.();
  (databaseTimer as any).unref?.();
  void enrichMetadata();

  try {
    await runPortal({
      name: "solard-market-live-index",
      portalUrl: portal,
      finalized,
      from,
      buildQuery: (cursor) => buildLiveQuery(cursor),
      onBlock: (block) => processLiveBlock(block, finalized),
      onCursor: (nextSlot, parentHash) =>
        db.setCheckpoint(LIVE_STREAM, nextSlot, parentHash),
      onReorg: async (commonSlot) => {
        db.rollbackPumpAfterSlot(commonSlot);
        db.rollbackSolardAfterSlot(commonSlot);
        db.setCheckpoint(LIVE_STREAM, commonSlot + 1);
      },
    });
  } finally {
    clearInterval(metadataTimer);
    clearInterval(seedTimer);
    clearInterval(databaseTimer);
  }
}

if (import.meta.main) {
  await measure
    .root({ start: () => "SQD migrated PumpSwap + SOLARD indexer" }, main)
    .catch((error: unknown) => {
      console.error("[sqd-index] fatal", error);
      process.exitCode = 1;
    });
}
