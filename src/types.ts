import type {
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";

export type SolardConfig = {
  rpcUrl: string;
  rpcMaxRps: number;
  cluster: string;
  programId: string;
  pumpSwapProgramId: string;
  collateralSymbol: string;
  explorerBase: string;
};

export type SideName = "long" | "short";
export type FeedSort = "age" | "marketCap" | "health";
export type WalletProviderName = "phantom" | "solflare" | "backpack";

export type PublicKeyLike =
  | PublicKey
  | { toString(): string; toBase58?: () => string }
  | string;
export type SolanaTransaction = Transaction | VersionedTransaction;

export type InjectedWallet = {
  publicKey?: PublicKeyLike | null;
  isConnected?: boolean;
  isPhantom?: boolean;
  isSolflare?: boolean;
  isBackpack?: boolean;
  connect: (options?: {
    onlyIfTrusted?: boolean;
  }) => Promise<{ publicKey?: PublicKeyLike } | void>;
  disconnect?: () => Promise<void>;
  request?: (payload: { method: string; params?: unknown }) => Promise<unknown>;
  signTransaction: <T extends SolanaTransaction>(transaction: T) => Promise<T>;
  signAllTransactions?: <T extends SolanaTransaction>(
    transactions: T[],
  ) => Promise<T[]>;
  signAndSendTransaction?: (
    transaction: SolanaTransaction,
    options?: unknown,
  ) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler: (...args: unknown[]) => void) => void;
};

export type WalletOption = {
  name: WalletProviderName;
  label: string;
  provider: InjectedWallet;
};

/**
 * A token-specific executable view assembled from the one Solard Global account
 * plus a PumpSwap Pool account. There is no Solard Market account in the current
 * program; `address` is the PumpSwap pool address.
 */
export type MarketSnapshot = {
  address: PublicKey;
  global: PublicKey;
  authority: PublicKey;
  collateralMint: PublicKey;
  vault: PublicKey;
  totalCollateral: bigint;
  vaultBalance: bigint;
  paused: boolean;
  pumpswapPool: PublicKey;
  poolBaseToken: PublicKey;
  poolQuoteToken: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  baseDecimals: number;
  quoteDecimals: number;
  collateralDecimals: number;
  tokenProgram: PublicKey;
  storedPriceE6: bigint;
  poolPriceE6: bigint;
  virtualQuoteReserves: bigint;
  currentSlot: bigint;
  maxLeverageBps: number;
  maintenanceMarginBps: number;
  settlementMode: boolean;
};

export type PositionSnapshot = {
  address: PublicKey;
  owner: PublicKey;
  baseMint: PublicKey;
  pool: PublicKey;
  collateralAmount: bigint;
  notionalAmount: bigint;
  entryPriceE6: bigint;
  openedSlot: bigint;
  leverageBps: number;
  side: SideName;
  bump: number;
};

export type MarketPosition = {
  market: MarketSnapshot;
  position: PositionSnapshot;
};

export type WalletBalances = {
  /** Spendable native SOL plus wrapped SOL, net of the transaction-fee reserve. */
  raw: bigint;
  /** Actual native SOL plus wrapped SOL before reserving transaction fees. */
  totalRaw: bigint;
  ata: PublicKey | null;
};

export type ActivityItem = {
  signature: string;
  slot: number;
  blockTime: number | null;
  eventName: string;
  data: Record<string, unknown>;
};

export type FeedToken = {
  mint: string;
  pairAddress: string | null;
  poolBaseToken?: string | null;
  poolQuoteToken?: string | null;
  quoteMint?: string | null;
  baseDecimals?: number;
  symbol: string;
  name: string;
  imageUrl: string | null;
  dexId: string;
  quoteSymbol: string;
  url: string | null;
  priceUsd: number | null;
  priceNative: number | null;
  marketCap: number | null;
  fdv: number | null;
  liquidityUsd: number | null;
  marketCapSol: number | null;
  liquiditySol: number | null;
  pairCreatedAt: number;
  tokenCreatedAt: number | null;
  newPair: boolean;
  migrated: boolean;
  activePerp: boolean;
  marketAddress: string | null;
  maxLeverage: number;
  paused: boolean;
  settlementMode: boolean;
  source: "onchain";
  seeded: boolean;
  seedRank: number | null;
};

export type TokenFeedPayload = {
  tokens: FeedToken[];
  updatedAt: number;
  source: string;
  warning?: string;
};


export type ToastItem = {
  id: number;
  message: string;
  tone: "default" | "good" | "bad" | "warn" | "violet";
};
