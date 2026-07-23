import {
  Database,
  type DatabaseType,
  type MigrationPlan,
  z,
} from "sqlite-zod-orm";

const WSOL_MINT = "So11111111111111111111111111111111111111112";

const nullableText = z.string().nullable().default(null);
const nullableInt = z.number().int().nullable().default(null);

const pumpTokenSchema = z.object({
  mint: z.string(),
  name: z.string().default(""),
  symbol: z.string().default(""),
  metadataUri: nullableText,
  imageUrl: nullableText,
  creator: nullableText,
  bondingCurve: nullableText,
  createKind: nullableText,
  createSignature: nullableText,
  createdSlot: z.number().int().default(0),
  createdAtMs: z.number().int().default(0),
  metadataUpdatedAtMs: z.number().int().default(0),
});

const pumpSwapPoolSchema = z.object({
  pool: z.string(),
  mint: z.string(),
  poolAuthority: nullableText,
  poolBaseToken: z.string(),
  poolQuoteToken: z.string(),
  quoteMint: z.string(),
  lpMint: z.string(),
  migrationSignature: nullableText,
  migrationSlot: nullableInt,
  migratedAtMs: nullableInt,
  discoverySource: z.enum(["migration", "seed"]).default("migration"),
  seedRank: nullableInt,
  finalized: z.boolean().default(true),
});

const solardActivitySchema = z.object({
  eventKey: z.string(),
  signature: z.string(),
  instructionAddress: z.string(),
  instruction: z.enum(["open_position", "close_position"]),
  owner: z.string(),
  positionPda: z.string(),
  baseMint: z.string(),
  pool: z.string(),
  side: z.enum(["long", "short"]).nullable().default(null),
  collateralAmount: nullableText,
  leverageBps: z.number().int().nullable().default(null),
  priceLimitE6: nullableText,
  minPayout: nullableText,
  slot: z.number().int(),
  timestampMs: z.number().int(),
});

const solardPositionSchema = z.object({
  positionPda: z.string(),
  owner: z.string(),
  baseMint: z.string(),
  pool: z.string(),
  side: z.enum(["long", "short"]),
  collateralAmount: z.string(),
  leverageBps: z.number().int(),
  notionalAmount: z.string(),
  entryPriceE6: z.string().default("0"),
  openedSlot: z.number().int(),
  openedAtMs: z.number().int(),
  openSignature: z.string(),
  status: z.enum(["open", "closed"]).default("open"),
  closedSlot: z.number().int().nullable().default(null),
  closedAtMs: z.number().int().nullable().default(null),
  closeSignature: nullableText,
});

const indexerCheckpointSchema = z.object({
  stream: z.string(),
  nextSlot: z.number().int(),
  parentHash: nullableText,
  updatedAtMs: z.number().int(),
});

const schemas = {
  pump_tokens: pumpTokenSchema,
  pumpswap_pools: pumpSwapPoolSchema,
  solard_activity: solardActivitySchema,
  solard_positions: solardPositionSchema,
  indexer_checkpoints: indexerCheckpointSchema,
} as const;

type SolardOrm = DatabaseType<typeof schemas>;
type PumpTokenRow = {
  id: number;
  mint: string;
  name: string;
  symbol: string;
  metadataUri: string | null;
  imageUrl: string | null;
  creator: string | null;
  bondingCurve: string | null;
  createKind: string | null;
  createSignature: string | null;
  createdSlot: number;
  createdAtMs: number;
  metadataUpdatedAtMs: number;
};
type PumpSwapPoolRow = {
  id: number;
  pool: string;
  mint: string;
  poolAuthority: string | null;
  poolBaseToken: string;
  poolQuoteToken: string;
  quoteMint: string;
  lpMint: string;
  migrationSignature: string | null;
  migrationSlot: number | null;
  migratedAtMs: number | null;
  discoverySource: "migration" | "seed";
  seedRank: number | null;
  finalized: boolean;
};
type SolardActivityRow = {
  id: number;
  eventKey: string;
  signature: string;
  instructionAddress: string;
  instruction: "open_position" | "close_position";
  owner: string;
  positionPda: string;
  baseMint: string;
  pool: string;
  side: "long" | "short" | null;
  collateralAmount: string | null;
  leverageBps: number | null;
  priceLimitE6: string | null;
  minPayout: string | null;
  slot: number;
  timestampMs: number;
};
type SolardPositionRow = {
  id: number;
  positionPda: string;
  owner: string;
  baseMint: string;
  pool: string;
  side: "long" | "short";
  collateralAmount: string;
  leverageBps: number;
  notionalAmount: string;
  entryPriceE6: string;
  openedSlot: number;
  openedAtMs: number;
  openSignature: string;
  status: "open" | "closed";
  closedSlot: number | null;
  closedAtMs: number | null;
  closeSignature: string | null;
};

export type IndexedToken = {
  mint: string;
  name: string;
  symbol: string;
  metadata_uri: string | null;
  image_url: string | null;
  creator: string | null;
  bonding_curve: string | null;
  create_kind: string | null;
  create_signature: string | null;
  created_slot: number;
  created_at_ms: number;
  pool: string;
  pool_authority: string | null;
  pool_base_token: string;
  pool_quote_token: string;
  quote_mint: string;
  lp_mint: string;
  migration_signature: string | null;
  migration_slot: number | null;
  migrated_at_ms: number | null;
  discovery_source: "migration" | "seed";
  seed_rank: number | null;
  finalized: boolean;
  metadata_updated_at_ms: number;
};

export type IndexedPosition = {
  position_pda: string;
  owner: string;
  base_mint: string;
  pool: string;
  side: "long" | "short";
  collateral_amount: string;
  leverage_bps: number;
  notional_amount: string;
  entry_price_e6: string;
  opened_slot: number;
  opened_at_ms: number;
  open_signature: string;
  status: "open" | "closed";
  closed_slot: number | null;
  closed_at_ms: number | null;
  close_signature: string | null;
};

export type IndexedActivity = {
  id: string;
  signature: string;
  instruction_address: string;
  instruction: "open_position" | "close_position";
  owner: string;
  position_pda: string;
  base_mint: string;
  pool: string;
  side: "long" | "short" | null;
  collateral_amount: string | null;
  leverage_bps: number | null;
  price_limit_e6: string | null;
  min_payout: string | null;
  slot: number;
  timestamp_ms: number;
};

export type PendingToken = {
  mint: string;
  name: string;
  symbol: string;
  metadata_uri: string | null;
  image_url: string | null;
  creator: string | null;
  bonding_curve: string | null;
  create_kind: string | null;
  create_signature: string | null;
  created_slot: number;
  created_at_ms: number;
  metadata_updated_at_ms: number;
};

export type TokenCreateInput = {
  mint: string;
  name: string;
  symbol: string;
  metadataUri: string | null;
  creator: string | null;
  bondingCurve: string | null;
  createKind: string;
  signature: string;
  slot: number;
  timestampMs: number;
};

export type MigrationInput = {
  mint: string;
  pool: string;
  poolAuthority: string;
  poolBaseToken: string;
  poolQuoteToken: string;
  quoteMint: string;
  lpMint: string;
  signature: string;
  slot: number;
  timestampMs: number;
  finalized: boolean;
};

export type SeedMarketInput = {
  mint: string;
  name: string;
  symbol: string;
  pool: string;
  poolBaseToken: string;
  poolQuoteToken: string;
  quoteMint: string;
  lpMint: string;
  seedRank: number;
};

export type OpenPositionInput = {
  id: string;
  signature: string;
  instructionAddress: string;
  owner: string;
  positionPda: string;
  baseMint: string;
  pool: string;
  side: "long" | "short";
  collateralAmount: bigint;
  leverageBps: number;
  priceLimitE6: bigint;
  slot: number;
  timestampMs: number;
};

export type ClosePositionInput = {
  id: string;
  signature: string;
  instructionAddress: string;
  owner: string;
  positionPda: string;
  baseMint: string;
  pool: string;
  minPayout: bigint;
  slot: number;
  timestampMs: number;
};

function createOrm(path: string): SolardOrm {
  return new Database(path, schemas, {
    wal: true,
    reactive: false,
    indexes: {
      pump_tokens: ["createdSlot", "metadataUpdatedAtMs"],
      pumpswap_pools: ["migrationSlot", "quoteMint", "seedRank"],
      solard_activity: ["slot", ["owner", "slot"]],
      solard_positions: [
        ["status", "openedSlot"],
        ["owner", "status"],
      ],
      indexer_checkpoints: ["updatedAtMs"],
    },
    unique: {
      pump_tokens: [["mint"]],
      pumpswap_pools: [["pool"], ["mint"]],
      solard_activity: [["eventKey"]],
      solard_positions: [["positionPda"]],
      indexer_checkpoints: [["stream"]],
    },
  });
}

const legacyColumns: Record<string, MigrationPlan["columns"]> = {
  pump_tokens: {
    mint: { source: "mint" },
    name: { source: "name" },
    symbol: { source: "symbol" },
    metadataUri: { source: "metadata_uri" },
    imageUrl: { source: "image_url" },
    creator: { source: "creator" },
    bondingCurve: { source: "bonding_curve" },
    createKind: { source: "create_kind" },
    createSignature: { source: "create_signature" },
    createdSlot: { source: "created_slot" },
    createdAtMs: { source: "created_at_ms" },
    metadataUpdatedAtMs: { source: "metadata_updated_at_ms" },
  },
  pumpswap_pools: {
    pool: { source: "pool" },
    mint: { source: "mint" },
    poolAuthority: { source: "pool_authority" },
    poolBaseToken: { source: "pool_base_token" },
    poolQuoteToken: { source: "pool_quote_token" },
    quoteMint: { source: "quote_mint" },
    lpMint: { source: "lp_mint" },
    migrationSignature: { source: "migration_signature" },
    migrationSlot: { source: "migration_slot" },
    migratedAtMs: { source: "migrated_at_ms" },
    finalized: { source: "finalized" },
  },
  solard_activity: {
    eventKey: { source: "id" },
    signature: { source: "signature" },
    instructionAddress: { source: "instruction_address" },
    instruction: { source: "instruction" },
    owner: { source: "owner" },
    positionPda: { source: "position_pda" },
    baseMint: { source: "base_mint" },
    pool: { source: "pool" },
    side: { source: "side" },
    collateralAmount: { source: "collateral_amount" },
    leverageBps: { source: "leverage_bps" },
    priceLimitE6: { source: "price_limit_e6" },
    minPayout: { source: "min_payout" },
    slot: { source: "slot" },
    timestampMs: { source: "timestamp_ms" },
  },
  solard_positions: {
    positionPda: { source: "position_pda" },
    owner: { source: "owner" },
    baseMint: { source: "base_mint" },
    pool: { source: "pool" },
    side: { source: "side" },
    collateralAmount: { source: "collateral_amount" },
    leverageBps: { source: "leverage_bps" },
    notionalAmount: { source: "notional_amount" },
    entryPriceE6: { source: "entry_price_e6" },
    openedSlot: { source: "opened_slot" },
    openedAtMs: { source: "opened_at_ms" },
    openSignature: { source: "open_signature" },
    status: { source: "status" },
    closedSlot: { source: "closed_slot" },
    closedAtMs: { source: "closed_at_ms" },
    closeSignature: { source: "close_signature" },
  },
  indexer_checkpoints: {
    stream: { source: "stream" },
    nextSlot: { source: "next_slot" },
    parentHash: { source: "parent_hash" },
    updatedAtMs: { source: "updated_at_ms" },
  },
};

function migrateLegacyBackups(orm: SolardOrm): void {
  const migrator = orm.migrator();
  for (const backup of migrator.findBackups()) {
    const columns = legacyColumns[backup.table];
    if (!columns || backup.backupRows === 0) continue;
    migrator.apply({
      from: backup.backup,
      to: backup.table,
      columns,
      conflicts: "ignore",
    });
  }
}

function toPendingToken(row: PumpTokenRow): PendingToken {
  return {
    mint: row.mint,
    name: row.name,
    symbol: row.symbol,
    metadata_uri: row.metadataUri,
    image_url: row.imageUrl,
    creator: row.creator,
    bonding_curve: row.bondingCurve,
    create_kind: row.createKind,
    create_signature: row.createSignature,
    created_slot: row.createdSlot,
    created_at_ms: row.createdAtMs,
    metadata_updated_at_ms: row.metadataUpdatedAtMs,
  };
}

function toIndexedToken(
  token: PumpTokenRow,
  pool: PumpSwapPoolRow,
): IndexedToken {
  return {
    ...toPendingToken(token),
    pool: pool.pool,
    pool_authority: pool.poolAuthority,
    pool_base_token: pool.poolBaseToken,
    pool_quote_token: pool.poolQuoteToken,
    quote_mint: pool.quoteMint,
    lp_mint: pool.lpMint,
    migration_signature: pool.migrationSignature,
    migration_slot: pool.migrationSlot,
    migrated_at_ms: pool.migratedAtMs,
    discovery_source: pool.discoverySource,
    seed_rank: pool.seedRank,
    finalized: pool.finalized,
  };
}

function toIndexedPosition(row: SolardPositionRow): IndexedPosition {
  return {
    position_pda: row.positionPda,
    owner: row.owner,
    base_mint: row.baseMint,
    pool: row.pool,
    side: row.side,
    collateral_amount: row.collateralAmount,
    leverage_bps: row.leverageBps,
    notional_amount: row.notionalAmount,
    entry_price_e6: row.entryPriceE6,
    opened_slot: row.openedSlot,
    opened_at_ms: row.openedAtMs,
    open_signature: row.openSignature,
    status: row.status,
    closed_slot: row.closedSlot,
    closed_at_ms: row.closedAtMs,
    close_signature: row.closeSignature,
  };
}

function toIndexedActivity(row: SolardActivityRow): IndexedActivity {
  return {
    id: row.eventKey,
    signature: row.signature,
    instruction_address: row.instructionAddress,
    instruction: row.instruction,
    owner: row.owner,
    position_pda: row.positionPda,
    base_mint: row.baseMint,
    pool: row.pool,
    side: row.side,
    collateral_amount: row.collateralAmount,
    leverage_bps: row.leverageBps,
    price_limit_e6: row.priceLimitE6,
    min_payout: row.minPayout,
    slot: row.slot,
    timestamp_ms: row.timestampMs,
  };
}

export class MarketDatabase {
  readonly orm: SolardOrm;

  constructor(path = process.env.SOLARD_DB_PATH ?? "./solard.db") {
    this.orm = createOrm(path);
    migrateLegacyBackups(this.orm);
  }

  checkpoint(
    stream: string,
  ): { nextSlot: number; parentHash: string | null } | null {
    const row = this.orm.indexer_checkpoints.select().where({ stream }).first();
    return row ? { nextSlot: row.nextSlot, parentHash: row.parentHash } : null;
  }

  setCheckpoint(stream: string, nextSlot: number, parentHash?: string): void {
    this.orm.indexer_checkpoints.upsert(
      {
        stream,
        nextSlot,
        parentHash: parentHash ?? null,
        updatedAtMs: Date.now(),
      },
      {
        on: "stream",
        merge: (value) => ({
          nextSlot: value.excluded("nextSlot"),
          parentHash: value.excluded("parentHash"),
          updatedAtMs: value.excluded("updatedAtMs"),
        }),
      },
    );
  }

  upsertTokenCreate(input: TokenCreateInput): void {
    const existing = this.orm.pump_tokens
      .select()
      .where({ mint: input.mint })
      .first();
    if (!existing) {
      this.orm.pump_tokens.insert({
        mint: input.mint,
        name: input.name,
        symbol: input.symbol,
        metadataUri: input.metadataUri,
        imageUrl: null,
        creator: input.creator,
        bondingCurve: input.bondingCurve,
        createKind: input.createKind,
        createSignature: input.signature,
        createdSlot: input.slot,
        createdAtMs: input.timestampMs,
        metadataUpdatedAtMs: 0,
      });
      return;
    }

    this.orm.pump_tokens.update(existing.id, {
      name: input.name || existing.name,
      symbol: input.symbol || existing.symbol,
      metadataUri: input.metadataUri ?? existing.metadataUri,
      creator: input.creator ?? existing.creator,
      bondingCurve: input.bondingCurve ?? existing.bondingCurve,
      createKind: input.createKind || existing.createKind,
      createSignature: input.signature || existing.createSignature,
      createdSlot:
        existing.createdSlot === 0
          ? input.slot
          : Math.min(existing.createdSlot, input.slot),
      createdAtMs:
        existing.createdAtMs === 0
          ? input.timestampMs
          : Math.min(existing.createdAtMs, input.timestampMs),
    });
  }

  upsertMigration(input: MigrationInput): void {
    this.orm.transaction(() => {
      const token = this.orm.pump_tokens
        .select()
        .where({ mint: input.mint })
        .first();
      if (!token) {
        this.orm.pump_tokens.insert({
          mint: input.mint,
          name: "",
          symbol: "",
          metadataUri: null,
          imageUrl: null,
          creator: null,
          bondingCurve: null,
          createKind: null,
          createSignature: null,
          createdSlot: 0,
          createdAtMs: 0,
          metadataUpdatedAtMs: 0,
        });
      }

      const existing =
        this.orm.pumpswap_pools.select().where({ mint: input.mint }).first() ??
        this.orm.pumpswap_pools.select().where({ pool: input.pool }).first();
      const data = {
        pool: input.pool,
        mint: input.mint,
        poolAuthority: input.poolAuthority,
        poolBaseToken: input.poolBaseToken,
        poolQuoteToken: input.poolQuoteToken,
        quoteMint: input.quoteMint,
        lpMint: input.lpMint,
        migrationSignature: input.signature,
        migrationSlot: input.slot,
        migratedAtMs: input.timestampMs,
        discoverySource: "migration" as const,
        seedRank: existing?.seedRank ?? null,
        finalized: (existing?.finalized ?? false) || input.finalized,
      };
      if (existing) this.orm.pumpswap_pools.update(existing.id, data);
      else this.orm.pumpswap_pools.insert(data);
    });
  }

  upsertSeedMarket(input: SeedMarketInput): void {
    this.orm.transaction(() => {
      const token = this.orm.pump_tokens
        .select()
        .where({ mint: input.mint })
        .first();
      if (!token) {
        this.orm.pump_tokens.insert({
          mint: input.mint,
          name: input.name,
          symbol: input.symbol,
          metadataUri: null,
          imageUrl: null,
          creator: null,
          bondingCurve: null,
          createKind: null,
          createSignature: null,
          createdSlot: 0,
          createdAtMs: 0,
          metadataUpdatedAtMs: 0,
        });
      } else {
        this.orm.pump_tokens.update(token.id, {
          name: token.name || input.name,
          symbol: token.symbol || input.symbol,
        });
      }

      const existing =
        this.orm.pumpswap_pools.select().where({ mint: input.mint }).first() ??
        this.orm.pumpswap_pools.select().where({ pool: input.pool }).first();
      const data = {
        pool: input.pool,
        mint: input.mint,
        poolAuthority: existing?.poolAuthority ?? null,
        poolBaseToken: input.poolBaseToken,
        poolQuoteToken: input.poolQuoteToken,
        quoteMint: input.quoteMint,
        lpMint: input.lpMint,
        migrationSignature: existing?.migrationSignature ?? null,
        migrationSlot: existing?.migrationSlot ?? null,
        migratedAtMs: existing?.migratedAtMs ?? null,
        discoverySource:
          existing?.discoverySource === "migration"
            ? ("migration" as const)
            : ("seed" as const),
        seedRank: input.seedRank,
        finalized: existing?.finalized ?? true,
      };
      if (existing) this.orm.pumpswap_pools.update(existing.id, data);
      else this.orm.pumpswap_pools.insert(data);
    });
  }

  needsTokenHydration(mint: string): boolean {
    const row = this.orm.pump_tokens.select().where({ mint }).first();
    return !row?.metadataUri || !row?.imageUrl || (row?.createdAtMs ?? 0) <= 0;
  }

  updateTokenCreatedAt(mint: string, createdAtMs: number): void {
    if (!Number.isSafeInteger(createdAtMs) || createdAtMs <= 0) return;
    const existing = this.orm.pump_tokens.select().where({ mint }).first();
    if (!existing) return;
    this.orm.pump_tokens.update(existing.id, {
      createdAtMs:
        existing.createdAtMs > 0
          ? Math.min(existing.createdAtMs, createdAtMs)
          : createdAtMs,
    });
  }

  updateMetadataSource(
    mint: string,
    metadataUri: string,
    name?: string,
    symbol?: string,
  ): void {
    const existing = this.orm.pump_tokens.select().where({ mint }).first();
    if (!existing) {
      this.orm.pump_tokens.insert({
        mint,
        name: name ?? "",
        symbol: symbol ?? "",
        metadataUri,
        imageUrl: null,
        creator: null,
        bondingCurve: null,
        createKind: null,
        createSignature: null,
        createdSlot: 0,
        createdAtMs: 0,
        metadataUpdatedAtMs: 0,
      });
      return;
    }
    this.orm.pump_tokens.update(existing.id, {
      metadataUri,
      name: name || existing.name,
      symbol: symbol || existing.symbol,
      metadataUpdatedAtMs: 0,
    });
  }

  updateMetadata(
    mint: string,
    imageUrl: string | null,
    name?: string,
    symbol?: string,
  ): void {
    const existing = this.orm.pump_tokens.select().where({ mint }).first();
    if (!existing) return;
    this.orm.pump_tokens.update(existing.id, {
      imageUrl,
      name: name || existing.name,
      symbol: symbol || existing.symbol,
      metadataUpdatedAtMs: Date.now(),
    });
  }

  metadataQueue(limit = 12): PendingToken[] {
    const cutoff = Date.now() - 60_000;

    // The terminal only displays migrated PumpSwap markets, so metadata work
    // must never be consumed by the much larger stream of bonding-curve
    // creates. Build the queue strictly from indexed WSOL pool mints.
    const pools = this.orm.pumpswap_pools
      .select()
      .where({ quoteMint: WSOL_MINT })
      .orderBy("migrationSlot", "DESC")
      .limit(Math.max(200, limit * 40))
      .all() as PumpSwapPoolRow[];
    if (pools.length === 0) return [];

    const poolByMint = new Map(pools.map((pool) => [pool.mint, pool]));
    return this.orm.pump_tokens
      .select()
      .whereIn("mint", [...poolByMint.keys()])
      .all()
      .filter(
        (row) =>
          Boolean(row.metadataUri) &&
          (row.imageUrl === null || row.metadataUpdatedAtMs < cutoff),
      )
      .sort((left, right) => {
        const leftPool = poolByMint.get(left.mint)!;
        const rightPool = poolByMint.get(right.mint)!;
        const leftSeed = leftPool.seedRank ?? Number.MAX_SAFE_INTEGER;
        const rightSeed = rightPool.seedRank ?? Number.MAX_SAFE_INTEGER;
        if (leftSeed !== rightSeed) return leftSeed - rightSeed;
        const imagePriority =
          Number(left.imageUrl !== null) - Number(right.imageUrl !== null);
        if (imagePriority !== 0) return imagePriority;
        return (rightPool.migrationSlot ?? 0) - (leftPool.migrationSlot ?? 0);
      })
      .slice(0, limit)
      .map((row) => toPendingToken(row as PumpTokenRow));
  }

  listMigratedTokens(limit = 120): IndexedToken[] {
    const seededPools = this.orm.pumpswap_pools
      .select()
      .where({ quoteMint: WSOL_MINT, seedRank: { $isNotNull: true } })
      .limit(20)
      .all() as PumpSwapPoolRow[];
    const maximumAgeMs = Math.max(
      60_000,
      Number(process.env.SOLARD_MARKET_MAX_AGE_MS ?? 2 * 60 * 60_000),
    );
    const recentCutoff = Date.now() - maximumAgeMs;
    const recentPools = (
      this.orm.pumpswap_pools
        .select()
        .where({ quoteMint: WSOL_MINT, discoverySource: "migration" })
        .orderBy("migrationSlot", "DESC")
        .limit(Math.min(2_000, Math.max(500, limit * 10)))
        .all() as PumpSwapPoolRow[]
    ).filter(
      (pool) => pool.migratedAtMs !== null && pool.migratedAtMs >= recentCutoff,
    );
    const pools = [
      ...new Map(
        [...seededPools, ...recentPools].map((pool) => [pool.mint, pool]),
      ).values(),
    ].sort((left, right) => {
      const leftSeed = left.seedRank ?? Number.MAX_SAFE_INTEGER;
      const rightSeed = right.seedRank ?? Number.MAX_SAFE_INTEGER;
      if (leftSeed !== rightSeed) return leftSeed - rightSeed;
      return (right.migrationSlot ?? 0) - (left.migrationSlot ?? 0);
    });
    if (pools.length === 0) return [];

    const tokens = this.orm.pump_tokens
      .select()
      .whereIn(
        "mint",
        pools.map((pool) => pool.mint),
      )
      .all() as PumpTokenRow[];
    const byMint = new Map(tokens.map((token) => [token.mint, token]));
    return pools
      .map((pool) => {
        const token = byMint.get(pool.mint);
        return token?.imageUrl ? toIndexedToken(token, pool) : null;
      })
      .filter((value): value is IndexedToken => value !== null)
      .slice(0, limit);
  }

  findMigratedToken(mint: string): IndexedToken | null {
    const pool = this.orm.pumpswap_pools
      .select()
      .where({ mint, quoteMint: WSOL_MINT })
      .first();
    if (!pool) return null;
    const token = this.orm.pump_tokens.select().where({ mint }).first();
    return token?.imageUrl ? toIndexedToken(token, pool) : null;
  }

  searchMigratedTokens(query: string, limit = 12): IndexedToken[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return this.listMigratedTokens(limit);
    return this.listMigratedTokens(2_000)
      .filter(
        (token) =>
          token.mint.toLowerCase().includes(normalized) ||
          token.symbol.toLowerCase().includes(normalized) ||
          token.name.toLowerCase().includes(normalized),
      )
      .slice(0, Math.max(1, Math.min(50, limit)));
  }

  recordOpenPosition(input: OpenPositionInput): void {
    const notional =
      (input.collateralAmount * BigInt(input.leverageBps)) / 10_000n;
    this.orm.transaction(() => {
      this.orm.solard_activity.upsert(
        {
          eventKey: input.id,
          signature: input.signature,
          instructionAddress: input.instructionAddress,
          instruction: "open_position",
          owner: input.owner,
          positionPda: input.positionPda,
          baseMint: input.baseMint,
          pool: input.pool,
          side: input.side,
          collateralAmount: input.collateralAmount.toString(),
          leverageBps: input.leverageBps,
          priceLimitE6: input.priceLimitE6.toString(),
          minPayout: null,
          slot: input.slot,
          timestampMs: input.timestampMs,
        },
        { on: "eventKey", doNothing: true },
      );

      const existing = this.orm.solard_positions
        .select()
        .where({ positionPda: input.positionPda })
        .first();
      const data = {
        positionPda: input.positionPda,
        owner: input.owner,
        baseMint: input.baseMint,
        pool: input.pool,
        side: input.side,
        collateralAmount: input.collateralAmount.toString(),
        leverageBps: input.leverageBps,
        notionalAmount: notional.toString(),
        entryPriceE6: input.priceLimitE6.toString(),
        openedSlot: input.slot,
        openedAtMs: input.timestampMs,
        openSignature: input.signature,
        status: "open" as const,
        closedSlot: null,
        closedAtMs: null,
        closeSignature: null,
      };
      if (existing) this.orm.solard_positions.update(existing.id, data);
      else this.orm.solard_positions.insert(data);
    });
  }

  recordClosePosition(input: ClosePositionInput): void {
    this.orm.transaction(() => {
      this.orm.solard_activity.upsert(
        {
          eventKey: input.id,
          signature: input.signature,
          instructionAddress: input.instructionAddress,
          instruction: "close_position",
          owner: input.owner,
          positionPda: input.positionPda,
          baseMint: input.baseMint,
          pool: input.pool,
          side: null,
          collateralAmount: null,
          leverageBps: null,
          priceLimitE6: null,
          minPayout: input.minPayout.toString(),
          slot: input.slot,
          timestampMs: input.timestampMs,
        },
        { on: "eventKey", doNothing: true },
      );
      const existing = this.orm.solard_positions
        .select()
        .where({ positionPda: input.positionPda })
        .first();
      if (existing) {
        this.orm.solard_positions.update(existing.id, {
          status: "closed",
          closedSlot: input.slot,
          closedAtMs: input.timestampMs,
          closeSignature: input.signature,
        });
      }
    });
  }

  hydratePosition(input: {
    positionPda: string;
    side: "long" | "short";
    collateralAmount: bigint;
    notionalAmount: bigint;
    entryPriceE6: bigint;
    openedSlot: bigint;
  }): void {
    const existing = this.orm.solard_positions
      .select()
      .where({ positionPda: input.positionPda })
      .first();
    if (!existing) return;
    this.orm.solard_positions.update(existing.id, {
      side: input.side,
      collateralAmount: input.collateralAmount.toString(),
      notionalAmount: input.notionalAmount.toString(),
      entryPriceE6: input.entryPriceE6.toString(),
      openedSlot: Number(input.openedSlot),
    });
  }

  updatePositionEntry(
    positionPda: string,
    entryPriceE6: bigint,
    openedSlot: number,
  ): void {
    const existing = this.orm.solard_positions
      .select()
      .where({ positionPda })
      .first();
    if (!existing) return;
    this.orm.solard_positions.update(existing.id, {
      entryPriceE6: entryPriceE6.toString(),
      openedSlot: Math.max(existing.openedSlot, openedSlot),
    });
  }

  listPositions(owner?: string, limit = 100): IndexedPosition[] {
    const conditions = owner
      ? { status: "open" as const, owner }
      : { status: "open" as const };
    return this.orm.solard_positions
      .select()
      .where(conditions)
      .orderBy("openedSlot", "DESC")
      .limit(limit)
      .all()
      .map((row) => toIndexedPosition(row));
  }

  listActivity(owner?: string, limit = 100): IndexedActivity[] {
    const query = this.orm.solard_activity.select();
    if (owner) query.where({ owner });
    return query
      .orderBy("slot", "DESC")
      .limit(limit)
      .all()
      .map((row) => toIndexedActivity(row));
  }

  indexSummary(): {
    tokens: number;
    pools: number;
    readyMarkets: number;
    pendingMetadata: number;
    openPositions: number;
    activity: number;
    checkpoint: { nextSlot: number; parentHash: string | null } | null;
  } {
    const tokens = this.orm.pump_tokens.select().all() as PumpTokenRow[];
    const pools = this.orm.pumpswap_pools
      .select()
      .where({ quoteMint: WSOL_MINT })
      .all() as PumpSwapPoolRow[];
    const tokenByMint = new Map(tokens.map((token) => [token.mint, token]));
    const readyMarkets = pools.filter((pool) =>
      Boolean(tokenByMint.get(pool.mint)?.imageUrl),
    ).length;
    return {
      tokens: tokens.length,
      pools: pools.length,
      readyMarkets,
      pendingMetadata: Math.max(0, pools.length - readyMarkets),
      openPositions: this.orm.solard_positions
        .select()
        .where({ status: "open" })
        .all().length,
      activity: this.orm.solard_activity.select().all().length,
      checkpoint: this.checkpoint("sqd:v3:live"),
    };
  }

  pruneUnseededPoolsBeforeSlot(minimumSlot: number): number {
    const stale = (
      this.orm.pumpswap_pools.select().all() as PumpSwapPoolRow[]
    ).filter(
      (pool) =>
        pool.seedRank === null &&
        pool.discoverySource === "migration" &&
        (pool.migrationSlot ?? 0) < minimumSlot,
    );
    if (stale.length === 0) return 0;
    this.orm.transaction(() => {
      for (const pool of stale) {
        this.orm.pumpswap_pools.delete().where({ id: pool.id }).exec();
      }
    });
    return stale.length;
  }

  rollbackPumpAfterSlot(slot: number): void {
    this.orm.transaction(() => {
      this.orm.pumpswap_pools
        .delete()
        .where({ migrationSlot: { $gt: slot } })
        .exec();
      this.orm.pump_tokens
        .delete()
        .where({ createdSlot: { $gt: slot } })
        .exec();
    });
  }

  rollbackSolardAfterSlot(slot: number): void {
    this.orm.transaction(() => {
      this.orm.solard_activity
        .delete()
        .where({ slot: { $gt: slot } })
        .exec();
      this.rebuildPositions();
    });
  }

  private rebuildPositions(): void {
    this.orm.solard_positions
      .delete()
      .where({ id: { $gt: 0 } })
      .exec();

    const opens = this.orm.solard_activity
      .select()
      .where({ instruction: "open_position" })
      .orderBy("slot", "ASC")
      .all();
    for (const row of opens) {
      if (
        !row.side ||
        row.collateralAmount === null ||
        row.leverageBps === null
      )
        continue;
      const collateral = BigInt(row.collateralAmount);
      const notional = (collateral * BigInt(row.leverageBps)) / 10_000n;
      const existing = this.orm.solard_positions
        .select()
        .where({ positionPda: row.positionPda })
        .first();
      const data = {
        positionPda: row.positionPda,
        owner: row.owner,
        baseMint: row.baseMint,
        pool: row.pool,
        side: row.side,
        collateralAmount: row.collateralAmount,
        leverageBps: row.leverageBps,
        notionalAmount: notional.toString(),
        entryPriceE6: row.priceLimitE6 ?? "0",
        openedSlot: row.slot,
        openedAtMs: row.timestampMs,
        openSignature: row.signature,
        status: "open" as const,
        closedSlot: null,
        closedAtMs: null,
        closeSignature: null,
      };
      if (existing) this.orm.solard_positions.update(existing.id, data);
      else this.orm.solard_positions.insert(data);
    }

    const closes = this.orm.solard_activity
      .select()
      .where({ instruction: "close_position" })
      .orderBy("slot", "ASC")
      .all();
    for (const row of closes) {
      const position = this.orm.solard_positions
        .select()
        .where({ positionPda: row.positionPda })
        .first();
      if (!position) continue;
      this.orm.solard_positions.update(position.id, {
        status: "closed",
        closedSlot: row.slot,
        closedAtMs: row.timestampMs,
        closeSignature: row.signature,
      });
    }
  }
}

let singleton: MarketDatabase | null = null;
export function marketDatabase(): MarketDatabase {
  singleton ??= new MarketDatabase();
  return singleton;
}
