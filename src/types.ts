import type {
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";

export type SolardConfig = {
  rpcUrl: string;
  cluster: string;
  programId: string;
  marketAddress: string;
  vaultAddress: string;
  marketSymbol: string;
  collateralSymbol: string;
  explorerBase: string;
};

export type SideName = "long" | "short";
export type FeedFilter = "all" | "new" | "migrated" | "active";
export type FeedSort = "created" | "marketCap" | "volume" | "leverage";
export type WalletProviderName = "phantom" | "solflare" | "backpack";

export type PublicKeyLike =
  PublicKey | { toString(): string; toBase58?: () => string } | string;
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

export type MarketSnapshot = {
  address: PublicKey;
  authority: PublicKey;
  oracleAuthority: PublicKey;
  collateralMint: PublicKey;
  vault: PublicKey;
  marketIndex: bigint;
  storedPriceE6: bigint;
  poolPriceE6: bigint;
  lastPriceUpdateSlot: bigint;
  currentSlot: bigint;
  maxPriceAgeSlots: bigint;
  maxOpenInterest: bigint;
  totalOpenInterest: bigint;
  longOpenInterest: bigint;
  shortOpenInterest: bigint;
  totalCollateral: bigint;
  vaultBalance: bigint;
  maxLeverageBps: number;
  maintenanceMarginBps: number;
  liquidationRewardBps: number;
  paused: boolean;
  settlementMode: boolean;
  pumpswapPool: PublicKey;
  poolBaseToken: PublicKey;
  poolQuoteToken: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  baseDecimals: number;
  quoteDecimals: number;
  collateralDecimals: number;
  tokenProgram: PublicKey;
};

export type PositionSnapshot = {
  address: PublicKey;
  owner: PublicKey;
  market: PublicKey;
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
  raw: bigint;
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
  symbol: string;
  name: string;
  imageUrl: string | null;
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
  newPair: boolean;
  migrated: boolean;
  activePerp: boolean;
  marketAddress: string | null;
  maxLeverage: number;
  paused: boolean;
  settlementMode: boolean;
  source: "dexscreener" | "geckoterminal" | "onchain";
};

export type TokenFeedPayload = {
  tokens: FeedToken[];
  updatedAt: number;
  source: string;
  warning?: string;
};

export type TapeItem = {
  mint: string;
  symbol: string;
  direction: 1 | -1;
  value: number;
  time: number;
};

export type ToastItem = {
  id: number;
  message: string;
  tone: "default" | "good" | "bad" | "warn" | "violet";
};
