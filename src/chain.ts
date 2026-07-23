import { AnchorProvider, BN, Program, type Idl } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
  unpackAccount,
  unpackMint,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  type Transaction,
  type TransactionInstruction,
  type VersionedTransaction,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import idl from "./idl/solard.json";
import { bigintFromUnknown, numberFromUnknown } from "./format";
import { errorRecord } from "./observability/error";
import type {
  FeedToken,
  InjectedWallet,
  MarketPosition,
  MarketSnapshot,
  PositionSnapshot,
  SideName,
  SolardConfig,
  WalletBalances,
} from "./types";
import { walletPublicKey } from "./wallet";

if (!globalThis.Buffer) globalThis.Buffer = Buffer;

const COMMITMENT = "confirmed" as const;
const MAX_LEVERAGE_BPS = 250_000;
const SOL_FEE_RESERVE_LAMPORTS = 10_000_000n;
const PUMPSWAP_POOL_DISCRIMINATOR = Uint8Array.from([
  241, 154, 109, 4, 17, 177, 109, 188,
]);
const ERROR_MESSAGES = new Map<number, string>(
  (idl.errors || []).map((error) => [error.code, error.msg || error.name]),
);

type AnyTransaction = Transaction | VersionedTransaction;
type WalletAdapter = {
  publicKey: PublicKey;
  payer?: Keypair;
  signTransaction<T extends AnyTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends AnyTransaction>(txs: T[]): Promise<T[]>;
};

type GlobalSnapshot = {
  address: PublicKey;
  authority: PublicKey;
  vault: PublicKey;
  collateralMint: PublicKey;
  totalCollateral: bigint;
  paused: boolean;
  vaultBalance: bigint;
  collateralDecimals: number;
};

type PumpSwapPool = {
  address: PublicKey;
  index: number;
  creator: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  poolBaseToken: PublicKey;
  poolQuoteToken: PublicKey;
  virtualQuoteReserves: bigint;
};

class RpcRequestGate {
  private tail: Promise<void> = Promise.resolve();
  private nextAt = 0;

  constructor(private readonly intervalMs: number) {}

  schedule<T>(work: () => Promise<T>, cost = 1): Promise<T> {
    const task = this.tail
      .catch(() => undefined)
      .then(async () => {
        const delay = Math.max(0, this.nextAt - Date.now());
        if (delay > 0)
          await new Promise<void>((resolve) =>
            globalThis.setTimeout(resolve, delay),
          );
        this.nextAt = Date.now() + this.intervalMs * Math.max(1, cost);
        return work();
      });
    this.tail = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }
}

const RPC_GATES = new Map<string, RpcRequestGate>();

function rateLimitConnection(
  connection: Connection,
  rpcUrl: string,
  maxRequestsPerSecond: number,
): void {
  const safeRps = Math.max(
    1,
    Math.min(3, Math.floor(maxRequestsPerSecond || 3)),
  );
  const intervalMs = Math.ceil(1_000 / safeRps) + 25;
  let gate = RPC_GATES.get(rpcUrl);
  if (!gate) {
    gate = new RpcRequestGate(intervalMs);
    RPC_GATES.set(rpcUrl, gate);
  }
  const target = connection as unknown as {
    _rpcRequest: (method: string, args: unknown[]) => Promise<unknown>;
  };
  const request = target._rpcRequest.bind(connection);
  // Every call stays a single JSON-RPC request. Some free RPC plans reject
  // both JSON-RPC request arrays and multi-account convenience methods.
  target._rpcRequest = (method, args) =>
    gate!.schedule(() => request(method, args));
}

class ReadonlyWallet implements WalletAdapter {
  readonly payer = Keypair.generate();
  readonly publicKey = this.payer.publicKey;

  async signTransaction<T extends AnyTransaction>(_tx: T): Promise<T> {
    throw new Error("Connect a wallet before sending a transaction.");
  }

  async signAllTransactions<T extends AnyTransaction>(_txs: T[]): Promise<T[]> {
    throw new Error("Connect a wallet before sending transactions.");
  }
}

function injectedWalletAdapter(provider: InjectedWallet): WalletAdapter {
  const publicKey = walletPublicKey(provider);
  if (!publicKey) throw new Error("Wallet is not connected.");
  return {
    publicKey,
    signTransaction: <T extends AnyTransaction>(tx: T) =>
      provider.signTransaction(tx),
    signAllTransactions: async <T extends AnyTransaction>(txs: T[]) => {
      if (provider.signAllTransactions)
        return provider.signAllTransactions(txs);
      const signed: T[] = [];
      for (const tx of txs) signed.push(await provider.signTransaction(tx));
      return signed;
    },
  };
}

function sideFromAnchor(value: unknown): SideName {
  if (value && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).map((key) =>
      key.toLowerCase(),
    );
    if (keys.includes("short")) return "short";
  }
  return "long";
}

function readPublicKey(data: Buffer, offset: number): PublicKey {
  return new PublicKey(data.subarray(offset, offset + 32));
}

function readU64LE(data: Buffer, offset: number): bigint {
  if (data.length < offset + 8) throw new Error("Account data is truncated.");
  return data.readBigUInt64LE(offset);
}

function decodeGlobalAccount(
  program: Program,
  data: Buffer,
): {
  authority: PublicKey;
  vault: PublicKey;
  collateralMint: PublicKey;
  totalCollateral: bigint;
  paused: boolean;
  bump: number;
  vaultBump: number;
} {
  const raw = program.coder.accounts.decode("global", data) as {
    authority: PublicKey;
    vault: PublicKey;
    collateralMint: PublicKey;
    totalCollateral: unknown;
    paused: boolean;
    bump: number;
    vaultBump: number;
  };
  return {
    authority: raw.authority,
    vault: raw.vault,
    collateralMint: raw.collateralMint,
    totalCollateral: bigintFromUnknown(raw.totalCollateral),
    paused: Boolean(raw.paused),
    bump: Number(raw.bump),
    vaultBump: Number(raw.vaultBump),
  };
}

function decodePositionAccount(
  program: Program,
  address: PublicKey,
  data: Buffer,
): PositionSnapshot {
  const raw = program.coder.accounts.decode("position", data);
  return normalizePosition(address, raw);
}

function readSignedI128LE(data: Buffer, offset: number): bigint {
  if (data.length < offset + 16) return 0n;
  let value = 0n;
  for (let index = 0; index < 16; index += 1) {
    value |= BigInt(data[offset + index]) << BigInt(index * 8);
  }
  return value & (1n << 127n) ? value - (1n << 128n) : value;
}

function decodePumpSwapPool(address: PublicKey, raw: Buffer): PumpSwapPool {
  if (raw.length < 261)
    throw new Error(`PumpSwap pool ${address.toBase58()} is too small.`);
  for (let index = 0; index < 8; index += 1) {
    if (raw[index] !== PUMPSWAP_POOL_DISCRIMINATOR[index]) {
      throw new Error(`${address.toBase58()} is not a PumpSwap Pool account.`);
    }
  }
  return {
    address,
    index: raw.readUInt16LE(9),
    creator: readPublicKey(raw, 11),
    baseMint: readPublicKey(raw, 43),
    quoteMint: readPublicKey(raw, 75),
    poolBaseToken: readPublicKey(raw, 139),
    poolQuoteToken: readPublicKey(raw, 171),
    virtualQuoteReserves: readSignedI128LE(raw, 245),
  };
}

function calculatePoolPriceE6(
  baseReserves: bigint,
  quoteReserves: bigint,
  baseDecimals: number,
  quoteDecimals: number,
): bigint {
  if (baseReserves <= 0n || quoteReserves <= 0n) return 0n;
  const exponent = 6 + baseDecimals - quoteDecimals;
  const value =
    exponent >= 0
      ? (quoteReserves * 10n ** BigInt(exponent)) / baseReserves
      : quoteReserves / (baseReserves * 10n ** BigInt(-exponent));
  return value > 0n ? value : 1n;
}

function normalizePosition(address: PublicKey, raw: any): PositionSnapshot {
  const collateralAmount = bigintFromUnknown(raw.collateralAmount);
  const notionalAmount = bigintFromUnknown(raw.notionalAmount);
  const leverageBps =
    collateralAmount > 0n
      ? Number((notionalAmount * 10_000n) / collateralAmount)
      : 0;
  return {
    address,
    owner: raw.owner,
    baseMint: raw.baseMint,
    pool: raw.pool,
    collateralAmount,
    notionalAmount,
    entryPriceE6: bigintFromUnknown(raw.entryPriceE6),
    openedSlot: bigintFromUnknown(raw.openedSlot),
    leverageBps,
    side: sideFromAnchor(raw.side),
    bump: numberFromUnknown(raw.bump),
  };
}

function calculatePnl(position: PositionSnapshot, exitPriceE6: bigint): bigint {
  if (position.entryPriceE6 <= 0n) return 0n;
  const delta = exitPriceE6 - position.entryPriceE6;
  const signed = position.side === "long" ? delta : -delta;
  return (position.notionalAmount * signed) / position.entryPriceE6;
}

function validPublicKey(value: string | null | undefined): PublicKey | null {
  if (!value) return null;
  try {
    return new PublicKey(value);
  } catch {
    return null;
  }
}

export class SolardClient {
  readonly config: SolardConfig;
  readonly connection: Connection;
  readonly programId: PublicKey;
  readonly pumpSwapProgramId: PublicKey;
  readonly program: Program;
  readonly provider: AnchorProvider;
  readonly globalAddress: PublicKey;
  readonly vaultAddress: PublicKey;

  private readonly walletProvider: InjectedWallet | null;
  private globalCache: { expiresAt: number; value: GlobalSnapshot } | null =
    null;
  private readonly marketCache = new Map<
    string,
    { expiresAt: number; value: MarketSnapshot | null }
  >();

  constructor(
    config: SolardConfig,
    walletProvider: InjectedWallet | null = null,
  ) {
    this.config = config;
    this.connection = new Connection(config.rpcUrl, COMMITMENT);
    rateLimitConnection(this.connection, config.rpcUrl, config.rpcMaxRps);
    this.programId = new PublicKey(config.programId);
    this.pumpSwapProgramId = new PublicKey(config.pumpSwapProgramId);
    this.walletProvider = walletProvider;
    this.globalAddress = PublicKey.findProgramAddressSync(
      [Buffer.from("global")],
      this.programId,
    )[0];
    this.vaultAddress = PublicKey.findProgramAddressSync(
      [Buffer.from("vault")],
      this.programId,
    )[0];
    const wallet = walletProvider
      ? injectedWalletAdapter(walletProvider)
      : new ReadonlyWallet();
    this.provider = new AnchorProvider(this.connection, wallet as any, {
      commitment: COMMITMENT,
      preflightCommitment: COMMITMENT,
    });
    const runtimeIdl = {
      ...(idl as Idl),
      address: this.programId.toBase58(),
    } as Idl;
    this.program = new Program(runtimeIdl, this.provider);
  }

  get walletPublicKey(): PublicKey | null {
    return walletPublicKey(this.walletProvider);
  }

  derivePositionAddress(owner: PublicKey, baseMint: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("position"), owner.toBuffer(), baseMint.toBuffer()],
      this.programId,
    )[0];
  }

  deriveWhitelistAddress(owner: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("whitelist"), owner.toBuffer()],
      this.programId,
    )[0];
  }

  private async getAccountInfoMap(
    addresses: PublicKey[],
  ): Promise<Map<string, any>> {
    const unique = new Map<string, PublicKey>();
    for (const address of addresses) unique.set(address.toBase58(), address);
    const result = new Map<string, any>();
    // Do not use getMultipleAccountsInfo here. The configured RPC explicitly
    // rejects multi-account/batch requests on its free plan. The connection
    // gate serializes these individual reads under PUBLIC_RPC_MAX_RPS.
    for (const address of unique.values()) {
      const info = await this.connection.getAccountInfo(address, COMMITMENT);
      if (info) result.set(address.toBase58(), info);
    }
    return result;
  }

  private async fetchGlobal(force = false): Promise<GlobalSnapshot> {
    if (!force && this.globalCache && this.globalCache.expiresAt > Date.now())
      return this.globalCache.value;
    const infos = await this.getAccountInfoMap([
      this.globalAddress,
      this.vaultAddress,
      NATIVE_MINT,
    ]);
    const globalInfo = infos.get(this.globalAddress.toBase58());
    const vaultInfo = infos.get(this.vaultAddress.toBase58());
    const mintInfo = infos.get(NATIVE_MINT.toBase58());
    if (!globalInfo || !vaultInfo || !mintInfo)
      throw new Error(
        "The Solard global, vault, or collateral mint is unavailable.",
      );
    if (!globalInfo.owner.equals(this.programId))
      throw new Error(
        `Global PDA ${this.globalAddress.toBase58()} is owned by the wrong program.`,
      );
    const raw = decodeGlobalAccount(this.program, Buffer.from(globalInfo.data));
    const collateralMint = raw.collateralMint;
    const vault = raw.vault;
    if (!collateralMint.equals(NATIVE_MINT)) {
      throw new Error(
        `The active Global account uses ${collateralMint.toBase58()} collateral; this SOL interface expects wrapped SOL.`,
      );
    }
    if (!vault.equals(this.vaultAddress)) {
      throw new Error(
        `Global vault ${vault.toBase58()} does not match the vault PDA ${this.vaultAddress.toBase58()}.`,
      );
    }
    if (
      !mintInfo.owner.equals(TOKEN_PROGRAM_ID) ||
      !vaultInfo.owner.equals(TOKEN_PROGRAM_ID)
    )
      throw new Error(
        "The current Solard program requires the classic SPL Token program.",
      );
    const mint = unpackMint(collateralMint, mintInfo, TOKEN_PROGRAM_ID);
    const vaultAccount = unpackAccount(vault, vaultInfo, TOKEN_PROGRAM_ID);
    const value: GlobalSnapshot = {
      address: this.globalAddress,
      authority: raw.authority,
      vault,
      collateralMint,
      totalCollateral: bigintFromUnknown(raw.totalCollateral),
      paused: Boolean(raw.paused),
      vaultBalance: vaultAccount.amount,
      collateralDecimals: mint.decimals,
    };
    this.globalCache = { expiresAt: Date.now() + 30_000, value };
    return value;
  }

  private marketFromPool(
    pool: PumpSwapPool,
    global: GlobalSnapshot,
    infos: Map<string, any>,
  ): MarketSnapshot {
    if (!pool.quoteMint.equals(global.collateralMint))
      throw new Error("The PumpSwap pool is not quoted in SOL.");
    const baseMintInfo = infos.get(pool.baseMint.toBase58());
    const quoteMintInfo = infos.get(pool.quoteMint.toBase58());
    const baseInfo = infos.get(pool.poolBaseToken.toBase58());
    const quoteInfo = infos.get(pool.poolQuoteToken.toBase58());
    if (!baseMintInfo || !quoteMintInfo || !baseInfo || !quoteInfo)
      throw new Error(
        "The PumpSwap pool mint or reserve accounts are unavailable.",
      );
    for (const info of [baseMintInfo, quoteMintInfo, baseInfo, quoteInfo]) {
      if (!info.owner.equals(TOKEN_PROGRAM_ID))
        throw new Error(
          "This pool uses a token program unsupported by Solard.",
        );
    }
    const baseMint = unpackMint(pool.baseMint, baseMintInfo, TOKEN_PROGRAM_ID);
    const quoteMint = unpackMint(
      pool.quoteMint,
      quoteMintInfo,
      TOKEN_PROGRAM_ID,
    );
    const baseAccount = unpackAccount(
      pool.poolBaseToken,
      baseInfo,
      TOKEN_PROGRAM_ID,
    );
    const quoteAccount = unpackAccount(
      pool.poolQuoteToken,
      quoteInfo,
      TOKEN_PROGRAM_ID,
    );
    if (!baseAccount.mint.equals(pool.baseMint))
      throw new Error("PumpSwap base reserve mint mismatch.");
    if (!quoteAccount.mint.equals(pool.quoteMint))
      throw new Error("PumpSwap quote reserve mint mismatch.");
    const effectiveQuote =
      quoteAccount.amount +
      (pool.virtualQuoteReserves > 0n ? pool.virtualQuoteReserves : 0n);
    const priceE6 = calculatePoolPriceE6(
      baseAccount.amount,
      effectiveQuote,
      baseMint.decimals,
      quoteMint.decimals,
    );
    return {
      address: pool.address,
      global: global.address,
      authority: global.authority,
      collateralMint: global.collateralMint,
      vault: global.vault,
      totalCollateral: global.totalCollateral,
      vaultBalance: global.vaultBalance,
      paused: global.paused,
      pumpswapPool: pool.address,
      poolBaseToken: pool.poolBaseToken,
      poolQuoteToken: pool.poolQuoteToken,
      baseMint: pool.baseMint,
      quoteMint: pool.quoteMint,
      baseDecimals: baseMint.decimals,
      quoteDecimals: quoteMint.decimals,
      collateralDecimals: global.collateralDecimals,
      tokenProgram: TOKEN_PROGRAM_ID,
      storedPriceE6: priceE6,
      poolPriceE6: priceE6,
      virtualQuoteReserves: pool.virtualQuoteReserves,
      currentSlot: 0n,
      maxLeverageBps: MAX_LEVERAGE_BPS,
      maintenanceMarginBps: 0,
      settlementMode: false,
    };
  }

  async fetchIndexedMarkets(tokens: FeedToken[]): Promise<MarketSnapshot[]> {
    const global = await this.fetchGlobal(false);
    const byMint = new Map<string, FeedToken>();
    for (const token of tokens) byMint.set(token.mint, token);
    return [...byMint.values()].flatMap((token) => {
      const pool = validPublicKey(token.pairAddress);
      const baseMint = validPublicKey(token.mint);
      const quoteMint = validPublicKey(
        token.quoteMint || NATIVE_MINT.toBase58(),
      );
      const poolBaseToken = validPublicKey(token.poolBaseToken);
      const poolQuoteToken = validPublicKey(token.poolQuoteToken);
      if (!pool || !baseMint || !quoteMint || !poolBaseToken || !poolQuoteToken)
        return [];
      if (!quoteMint.equals(global.collateralMint)) return [];
      const priceE6 = BigInt(
        Math.max(0, Math.round(Number(token.priceNative || 0) * 1_000_000)),
      );
      return [
        {
          address: pool,
          global: global.address,
          authority: global.authority,
          collateralMint: global.collateralMint,
          vault: global.vault,
          totalCollateral: global.totalCollateral,
          vaultBalance: global.vaultBalance,
          paused: global.paused,
          pumpswapPool: pool,
          poolBaseToken,
          poolQuoteToken,
          baseMint,
          quoteMint,
          baseDecimals: Number.isInteger(token.baseDecimals)
            ? token.baseDecimals!
            : 6,
          quoteDecimals: 9,
          collateralDecimals: global.collateralDecimals,
          tokenProgram: TOKEN_PROGRAM_ID,
          storedPriceE6: priceE6,
          poolPriceE6: priceE6,
          virtualQuoteReserves: 0n,
          currentSlot: 0n,
          maxLeverageBps: MAX_LEVERAGE_BPS,
          maintenanceMarginBps: 0,
          settlementMode: false,
        },
      ];
    });
  }

  async fetchMarkets(
    tokens: FeedToken[],
    force = false,
  ): Promise<MarketSnapshot[]> {
    const unique = new Map<string, FeedToken>();
    for (const token of tokens.slice(0, 80)) unique.set(token.mint, token);
    const entries = [...unique.values()];
    const global = await this.fetchGlobal(false);
    const marketsByMint = new Map<string, MarketSnapshot>();
    const pending: Array<{ token: FeedToken; mint: PublicKey }> = [];

    for (const token of entries) {
      const mint = validPublicKey(token.mint);
      if (!mint) continue;
      const cached = this.marketCache.get(token.mint);
      if (!force && cached && cached.expiresAt > Date.now()) {
        if (cached.value) marketsByMint.set(token.mint, cached.value);
        continue;
      }
      pending.push({ token, mint });
    }

    const pairByMint = new Map<string, PublicKey>();
    for (const { token } of pending) {
      const pair = validPublicKey(token.pairAddress);
      if (pair) pairByMint.set(token.mint, pair);
    }

    const candidateInfos = await this.getAccountInfoMap([
      ...pairByMint.values(),
    ]);
    const poolsByMint = new Map<string, PumpSwapPool>();
    for (const { token, mint } of pending) {
      const address = pairByMint.get(token.mint);
      const info = address ? candidateInfos.get(address.toBase58()) : null;
      let pool: PumpSwapPool | null = null;
      if (address && info && info.owner.equals(this.pumpSwapProgramId)) {
        try {
          const decoded = decodePumpSwapPool(address, Buffer.from(info.data));
          if (
            decoded.baseMint.equals(mint) &&
            decoded.quoteMint.equals(global.collateralMint)
          ) {
            pool = decoded;
          }
        } catch {
          // Feed pair was stale or was not a PumpSwap Pool account.
        }
      }
      if (pool) poolsByMint.set(token.mint, pool);
      else
        this.marketCache.set(token.mint, {
          expiresAt: Date.now() + 5_000,
          value: null,
        });
    }

    const resourceAddresses: PublicKey[] = [];
    for (const pool of poolsByMint.values()) {
      resourceAddresses.push(
        pool.baseMint,
        pool.quoteMint,
        pool.poolBaseToken,
        pool.poolQuoteToken,
      );
    }
    const resourceInfos = await this.getAccountInfoMap(resourceAddresses);
    for (const [mint, pool] of poolsByMint) {
      try {
        const market = this.marketFromPool(pool, global, resourceInfos);
        marketsByMint.set(mint, market);
        this.marketCache.set(mint, {
          expiresAt: Date.now() + 20_000,
          value: market,
        });
      } catch {
        this.marketCache.set(mint, {
          expiresAt: Date.now() + 10_000,
          value: null,
        });
      }
    }

    return entries
      .map((token) => marketsByMint.get(token.mint) || null)
      .filter((market): market is MarketSnapshot => Boolean(market));
  }

  async fetchPosition(
    owner: PublicKey,
    baseMint: PublicKey,
  ): Promise<PositionSnapshot | null> {
    const address = this.derivePositionAddress(owner, baseMint);
    const info = await this.connection.getAccountInfo(address, COMMITMENT);
    if (!info) return null;
    if (!info.owner.equals(this.programId)) return null;
    return decodePositionAccount(this.program, address, Buffer.from(info.data));
  }

  async fetchWalletPositions(
    owner: PublicKey,
    markets: MarketSnapshot[],
  ): Promise<MarketPosition[]> {
    const positions = await Promise.all(
      markets.map(async (market) => {
        const position = await this.fetchPosition(owner, market.baseMint);
        return position ? { market, position } : null;
      }),
    );
    return positions.filter((item): item is MarketPosition => Boolean(item));
  }

  async fetchSolBalance(owner: PublicKey): Promise<WalletBalances> {
    const ata = getAssociatedTokenAddressSync(
      NATIVE_MINT,
      owner,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    const infos = await this.getAccountInfoMap([owner, ata]);
    const ownerInfo = infos.get(owner.toBase58());
    const ataInfo = infos.get(ata.toBase58());
    let wrapped = 0n;
    if (ataInfo) {
      try {
        wrapped = unpackAccount(ata, ataInfo, TOKEN_PROGRAM_ID).amount;
      } catch {
        wrapped = 0n;
      }
    }
    const native = BigInt(ownerInfo?.lamports || 0);
    const spendableNative =
      native > SOL_FEE_RESERVE_LAMPORTS
        ? native - SOL_FEE_RESERVE_LAMPORTS
        : 0n;
    return { raw: wrapped + spendableNative, totalRaw: wrapped + native, ata };
  }

  async fetchWalletBalance(
    owner: PublicKey,
    market: MarketSnapshot,
  ): Promise<WalletBalances> {
    if (market.collateralMint.equals(NATIVE_MINT))
      return this.fetchSolBalance(owner);
    const ata = getAssociatedTokenAddressSync(
      market.collateralMint,
      owner,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    const info = await this.connection.getAccountInfo(ata, COMMITMENT);
    if (!info) return { raw: 0n, totalRaw: 0n, ata };
    const amount = unpackAccount(ata, info, TOKEN_PROGRAM_ID).amount;
    return { raw: amount, totalRaw: amount, ata };
  }

  private requireWallet(): PublicKey {
    const publicKey = this.walletPublicKey;
    if (!publicKey) throw new Error("Connect a wallet first.");
    return publicKey;
  }

  async openPosition(params: {
    market: MarketSnapshot;
    collateralAmount: bigint;
    leverageBps: number;
    side: SideName;
    priceLimitE6: bigint;
  }): Promise<string> {
    const owner = this.requireWallet();
    if (params.leverageBps < 10_000 || params.leverageBps > MAX_LEVERAGE_BPS)
      throw new Error("Leverage must be between 1x and 25x.");
    const ownerTokenAccount = getAssociatedTokenAddressSync(
      params.market.collateralMint,
      owner,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    const instructions: TransactionInstruction[] = [];
    let wrapped = 0n;
    try {
      const ownerTokenInfo = await this.connection.getAccountInfo(
        ownerTokenAccount,
        COMMITMENT,
      );
      if (!ownerTokenInfo) throw new Error("Wrapped SOL account not found.");
      wrapped = unpackAccount(
        ownerTokenAccount,
        ownerTokenInfo,
        TOKEN_PROGRAM_ID,
      ).amount;
    } catch {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          owner,
          ownerTokenAccount,
          owner,
          params.market.collateralMint,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        ),
      );
    }
    const shortfall =
      params.collateralAmount > wrapped
        ? params.collateralAmount - wrapped
        : 0n;
    if (shortfall > 0n) {
      if (!params.market.collateralMint.equals(NATIVE_MINT)) {
        throw new Error(
          "The connected wallet does not have enough collateral.",
        );
      }
      if (shortfall > BigInt(Number.MAX_SAFE_INTEGER))
        throw new Error(
          "Collateral amount is too large for a wallet transaction.",
        );
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: owner,
          toPubkey: ownerTokenAccount,
          lamports: Number(shortfall),
        }),
        createSyncNativeInstruction(ownerTokenAccount, TOKEN_PROGRAM_ID),
      );
    }
    return (this.program.methods as any)
      .openPosition(
        new BN(params.collateralAmount.toString()),
        params.leverageBps,
        params.side === "long" ? { long: {} } : { short: {} },
        new BN(params.priceLimitE6.toString()),
      )
      .accountsStrict({
        owner,
        global: params.market.global,
        pool: params.market.pumpswapPool,
        poolBaseToken: params.market.poolBaseToken,
        poolQuoteToken: params.market.poolQuoteToken,
        baseMint: params.market.baseMint,
        collateralMint: params.market.collateralMint,
        ownerTokenAccount,
        vault: params.market.vault,
        position: this.derivePositionAddress(owner, params.market.baseMint),
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .preInstructions(instructions)
      .rpc();
  }

  async closePosition(params: {
    market: MarketSnapshot;
    position: PositionSnapshot;
    minPayout: bigint;
  }): Promise<string> {
    const owner = this.requireWallet();
    const ownerTokenAccount = getAssociatedTokenAddressSync(
      params.market.collateralMint,
      owner,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    return (this.program.methods as any)
      .closePosition(new BN(params.minPayout.toString()))
      .accountsStrict({
        owner,
        global: params.market.global,
        whitelistEntry: this.deriveWhitelistAddress(owner),
        pool: params.market.pumpswapPool,
        poolBaseToken: params.market.poolBaseToken,
        poolQuoteToken: params.market.poolQuoteToken,
        baseMint: params.market.baseMint,
        position: params.position.address,
        collateralMint: params.market.collateralMint,
        ownerTokenAccount,
        vault: params.market.vault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  }
}

export function humanizeChainError(error: unknown): string {
  const detail = errorRecord(error);
  const cause = detail.cause || detail;
  const text = [detail.message, cause.message].filter(Boolean).join(" · ");
  const code = cause.code ?? detail.code;
  const customMatch = text.match(/custom program error: 0x([0-9a-f]+)/i);
  if (customMatch) {
    const customCode = Number.parseInt(customMatch[1], 16);
    const known = ERROR_MESSAGES.get(customCode);
    if (known) return known;
  }
  const anchorMatch = text.match(/Error Number: (\d+)/i);
  if (anchorMatch) {
    const known = ERROR_MESSAGES.get(Number(anchorMatch[1]));
    if (known) return known;
  }
  if (
    code === 4001 ||
    /User rejected|rejected the request|declined/i.test(text)
  ) {
    return "The request was rejected in the wallet.";
  }
  if (code === -32002) {
    return "A wallet request is already open. Finish or close the wallet popup, then try again.";
  }
  if (/WalletNotReady|not installed|provider was not found/i.test(text)) {
    return "No compatible wallet provider was detected in this tab.";
  }
  if (
    /Attempt to debit an account but found no record of a prior credit/i.test(
      text,
    )
  ) {
    return "The wallet needs SOL for transaction fees.";
  }
  if (/blockhash not found/i.test(text))
    return "The transaction expired. Please submit it again.";
  if (
    code === -32403 ||
    /Batch requests are only available|batch requests/i.test(text)
  )
    return "This RPC plan rejects batch requests. Reload the single-request build or use an RPC endpoint that allows batching.";
  if (/403|429|rate limit/i.test(text))
    return "The RPC endpoint is rate-limiting requests.";
  const message = cause.message || detail.message || "Unknown error";
  return `${code !== undefined ? `${code}: ` : ""}${message}`
    .replace(/^Error:\s*/, "")
    .slice(0, 360);
}

export function projectedPositionMetrics(
  position: PositionSnapshot,
  market: MarketSnapshot,
): {
  pnl: bigint;
  equity: bigint;
  maintenance: bigint;
  liquidationPriceE6: bigint;
} {
  const mark = market.poolPriceE6 || market.storedPriceE6;
  const pnl = calculatePnl(position, mark);
  const equity = position.collateralAmount + pnl;
  const maintenance = 0n;
  const leverageBps = BigInt(position.leverageBps);
  const one = 10_000n;
  const collateralShareBps = leverageBps > 0n ? (one * one) / leverageBps : one;
  const multiplierBps =
    position.side === "long"
      ? one - collateralShareBps
      : one + collateralShareBps;
  const liquidationPriceE6 =
    multiplierBps > 0n ? (position.entryPriceE6 * multiplierBps) / one : 0n;
  return { pnl, equity, maintenance, liquidationPriceE6 };
}
