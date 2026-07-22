import {
  AnchorProvider,
  BN,
  EventParser,
  Program,
  type Idl,
} from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  type Transaction,
  type VersionedTransaction,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import idl from "./idl/solard.json";
import { bigintFromUnknown, numberFromUnknown } from "./format";
import { errorRecord } from "./observability/error";
import type {
  ActivityItem,
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

function isTokenProgram(programId: PublicKey): boolean {
  return (
    programId.equals(TOKEN_PROGRAM_ID) ||
    programId.equals(TOKEN_2022_PROGRAM_ID)
  );
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

function normalizePosition(address: PublicKey, raw: any): PositionSnapshot {
  return {
    address,
    owner: raw.owner,
    market: raw.market,
    collateralAmount: bigintFromUnknown(raw.collateralAmount),
    notionalAmount: bigintFromUnknown(raw.notionalAmount),
    entryPriceE6: bigintFromUnknown(raw.entryPriceE6),
    openedSlot: bigintFromUnknown(raw.openedSlot),
    leverageBps: numberFromUnknown(raw.leverageBps),
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

export class SolardClient {
  readonly config: SolardConfig;
  readonly connection: Connection;
  readonly programId: PublicKey;
  readonly configuredMarketAddress: PublicKey;
  readonly configuredVault: PublicKey;
  readonly program: Program;
  readonly provider: AnchorProvider;

  private readonly walletProvider: InjectedWallet | null;

  constructor(
    config: SolardConfig,
    walletProvider: InjectedWallet | null = null,
  ) {
    this.config = config;
    this.connection = new Connection(config.rpcUrl, COMMITMENT);
    this.programId = new PublicKey(config.programId);
    this.configuredMarketAddress = new PublicKey(config.marketAddress);
    this.configuredVault = new PublicKey(config.vaultAddress);
    this.walletProvider = walletProvider;
    const wallet = walletProvider
      ? injectedWalletAdapter(walletProvider)
      : new ReadonlyWallet();
    this.provider = new AnchorProvider(this.connection, wallet as any, {
      commitment: COMMITMENT,
      preflightCommitment: COMMITMENT,
    });
    this.program = new Program(idl as Idl, this.provider);
  }

  get walletPublicKey(): PublicKey | null {
    return walletPublicKey(this.walletProvider);
  }

  derivePositionAddress(owner: PublicKey, marketAddress: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("position"), marketAddress.toBuffer(), owner.toBuffer()],
      this.programId,
    )[0];
  }

  private async normalizeMarket(
    address: PublicKey,
    raw: any,
    currentSlot: bigint,
  ): Promise<MarketSnapshot> {
    const collateralMint: PublicKey = raw.collateralMint;
    const vault: PublicKey = raw.vault;

    if (
      address.equals(this.configuredMarketAddress) &&
      !vault.equals(this.configuredVault)
    ) {
      throw new Error(
        `Configured vault ${this.configuredVault.toBase58()} does not match market vault ${vault.toBase58()}.`,
      );
    }

    const [mintInfo, vaultInfo, baseInfo, quoteInfo] =
      await this.connection.getMultipleAccountsInfo(
        [collateralMint, vault, raw.poolBaseToken, raw.poolQuoteToken],
        COMMITMENT,
      );
    if (!mintInfo)
      throw new Error(
        `Collateral mint ${collateralMint.toBase58()} was not found.`,
      );
    if (!vaultInfo) throw new Error(`Vault ${vault.toBase58()} was not found.`);
    if (!baseInfo || !quoteInfo)
      throw new Error("The PumpSwap reserve accounts were not found.");
    if (!isTokenProgram(mintInfo.owner)) {
      throw new Error(
        `Unsupported collateral token program: ${mintInfo.owner.toBase58()}`,
      );
    }
    if (!isTokenProgram(baseInfo.owner) || !isTokenProgram(quoteInfo.owner)) {
      throw new Error("A PumpSwap reserve uses an unsupported token program.");
    }

    const [mint, vaultAccount, baseAccount, quoteAccount] = await Promise.all([
      getMint(this.connection, collateralMint, COMMITMENT, mintInfo.owner),
      getAccount(this.connection, vault, COMMITMENT, vaultInfo.owner),
      getAccount(
        this.connection,
        raw.poolBaseToken,
        COMMITMENT,
        baseInfo.owner,
      ),
      getAccount(
        this.connection,
        raw.poolQuoteToken,
        COMMITMENT,
        quoteInfo.owner,
      ),
    ]);

    const baseDecimals = numberFromUnknown(raw.baseDecimals);
    const quoteDecimals = numberFromUnknown(raw.quoteDecimals);

    return {
      address,
      authority: raw.authority,
      oracleAuthority: raw.oracleAuthority,
      collateralMint,
      vault,
      marketIndex: bigintFromUnknown(raw.marketIndex),
      storedPriceE6: bigintFromUnknown(raw.priceE6),
      poolPriceE6: calculatePoolPriceE6(
        baseAccount.amount,
        quoteAccount.amount,
        baseDecimals,
        quoteDecimals,
      ),
      lastPriceUpdateSlot: bigintFromUnknown(raw.lastPriceUpdateSlot),
      currentSlot,
      maxPriceAgeSlots: bigintFromUnknown(raw.maxPriceAgeSlots),
      maxOpenInterest: bigintFromUnknown(raw.maxOpenInterest),
      totalOpenInterest: bigintFromUnknown(raw.totalOpenInterest),
      longOpenInterest: bigintFromUnknown(raw.longOpenInterest),
      shortOpenInterest: bigintFromUnknown(raw.shortOpenInterest),
      totalCollateral: bigintFromUnknown(raw.totalCollateral),
      vaultBalance: vaultAccount.amount,
      maxLeverageBps: numberFromUnknown(raw.maxLeverageBps),
      maintenanceMarginBps: numberFromUnknown(raw.maintenanceMarginBps),
      liquidationRewardBps: numberFromUnknown(raw.liquidationRewardBps),
      paused: Boolean(raw.paused),
      settlementMode: Boolean(raw.settlementMode),
      pumpswapPool: raw.pumpswapPool,
      poolBaseToken: raw.poolBaseToken,
      poolQuoteToken: raw.poolQuoteToken,
      baseMint: baseAccount.mint,
      quoteMint: quoteAccount.mint,
      baseDecimals,
      quoteDecimals,
      collateralDecimals: mint.decimals,
      tokenProgram: mintInfo.owner,
    };
  }

  async fetchMarket(
    address: PublicKey = this.configuredMarketAddress,
  ): Promise<MarketSnapshot> {
    const [raw, slot] = await Promise.all([
      (this.program.account as any).market.fetch(address),
      this.connection.getSlot(COMMITMENT),
    ]);
    return this.normalizeMarket(address, raw, BigInt(slot));
  }

  async fetchMarkets(): Promise<MarketSnapshot[]> {
    const slot = BigInt(await this.connection.getSlot(COMMITMENT));
    try {
      const accounts = await (this.program.account as any).market.all();
      const markets = await Promise.all(
        accounts.map((item: any) =>
          this.normalizeMarket(item.publicKey, item.account, slot),
        ),
      );
      return markets.sort((a, b) => {
        if (a.address.equals(this.configuredMarketAddress)) return -1;
        if (b.address.equals(this.configuredMarketAddress)) return 1;
        return a.marketIndex < b.marketIndex
          ? -1
          : a.marketIndex > b.marketIndex
            ? 1
            : 0;
      });
    } catch (error) {
      const configured = await this.fetchMarket(this.configuredMarketAddress);
      if (!configured) throw error;
      return [configured];
    }
  }

  async fetchPosition(
    owner: PublicKey,
    marketAddress: PublicKey,
  ): Promise<PositionSnapshot | null> {
    const address = this.derivePositionAddress(owner, marketAddress);
    const raw = await (this.program.account as any).position.fetchNullable(
      address,
    );
    return raw ? normalizePosition(address, raw) : null;
  }

  async fetchWalletPositions(
    owner: PublicKey,
    markets: MarketSnapshot[],
  ): Promise<MarketPosition[]> {
    const positions = await Promise.all(
      markets.map(async (market) => {
        const position = await this.fetchPosition(owner, market.address);
        return position ? { market, position } : null;
      }),
    );
    return positions.filter((item): item is MarketPosition => Boolean(item));
  }

  async fetchWalletBalance(
    owner: PublicKey,
    market: MarketSnapshot,
  ): Promise<WalletBalances> {
    const ata = getAssociatedTokenAddressSync(
      market.collateralMint,
      owner,
      false,
      market.tokenProgram,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    try {
      const tokenAccount = await getAccount(
        this.connection,
        ata,
        COMMITMENT,
        market.tokenProgram,
      );
      return { raw: tokenAccount.amount, ata };
    } catch {
      return { raw: 0n, ata: null };
    }
  }

  async fetchActivity(
    marketAddress: PublicKey,
    limit = 16,
  ): Promise<ActivityItem[]> {
    const signatures = await this.connection.getSignaturesForAddress(
      marketAddress,
      { limit },
      COMMITMENT,
    );
    const parser = new EventParser(this.programId, this.program.coder);
    const items: ActivityItem[] = [];

    for (const signatureInfo of signatures) {
      const transaction = await this.connection.getTransaction(
        signatureInfo.signature,
        {
          commitment: COMMITMENT,
          maxSupportedTransactionVersion: 0,
        },
      );
      const logs = transaction?.meta?.logMessages;
      if (!logs) continue;
      for (const event of parser.parseLogs(logs)) {
        items.push({
          signature: signatureInfo.signature,
          slot: signatureInfo.slot,
          blockTime: signatureInfo.blockTime ?? null,
          eventName: event.name,
          data: event.data as Record<string, unknown>,
        });
      }
    }
    return items.slice(0, limit);
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
    const ownerTokenAccount = getAssociatedTokenAddressSync(
      params.market.collateralMint,
      owner,
      false,
      params.market.tokenProgram,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    return (this.program.methods as any)
      .openPosition(
        new BN(params.collateralAmount.toString()),
        params.leverageBps,
        params.side === "long" ? { long: {} } : { short: {} },
        new BN(params.priceLimitE6.toString()),
      )
      .accountsStrict({
        owner,
        market: params.market.address,
        position: this.derivePositionAddress(owner, params.market.address),
        pumpswapPool: params.market.pumpswapPool,
        poolBaseToken: params.market.poolBaseToken,
        poolQuoteToken: params.market.poolQuoteToken,
        collateralMint: params.market.collateralMint,
        ownerTokenAccount,
        vault: params.market.vault,
        tokenProgram: params.market.tokenProgram,
        systemProgram: SystemProgram.programId,
      })
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
      params.market.tokenProgram,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    return (this.program.methods as any)
      .closePosition(new BN(params.minPayout.toString()))
      .accountsStrict({
        owner,
        market: params.market.address,
        position: params.position.address,
        pumpswapPool: params.market.pumpswapPool,
        poolBaseToken: params.market.poolBaseToken,
        poolQuoteToken: params.market.poolQuoteToken,
        collateralMint: params.market.collateralMint,
        ownerTokenAccount,
        vault: params.market.vault,
        tokenProgram: params.market.tokenProgram,
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
    return "A wallet request is already open. Finish or close the Phantom popup, then try again.";
  }
  if (code === -32603) {
    return "Phantom returned -32603: Unexpected error. Check the browser console and the TradJS server terminal for the full measured trace.";
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
  const maintenance =
    (position.notionalAmount * BigInt(market.maintenanceMarginBps)) / 10_000n;
  const leverageBps = BigInt(position.leverageBps);
  const mmrBps = BigInt(market.maintenanceMarginBps);
  const oneBps = 10_000n;
  const collateralShareBps =
    leverageBps > 0n ? (oneBps * oneBps) / leverageBps : oneBps;
  const multiplierBps =
    position.side === "long"
      ? oneBps + mmrBps - collateralShareBps
      : oneBps - mmrBps + collateralShareBps;
  const liquidationPriceE6 =
    multiplierBps > 0n ? (position.entryPriceE6 * multiplierBps) / oneBps : 0n;
  return { pnl, equity, maintenance, liquidationPriceE6 };
}
