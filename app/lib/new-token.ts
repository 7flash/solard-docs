import type { DexMarket } from "./market";

export type NewTokenSource =
  "pumpportal" | "solana-rpc" | "dexscreener-profile";

export type NewTokenItem = {
  id: string;
  source: NewTokenSource;
  mint: string;
  name: string;
  symbol: string;
  description: string | null;
  uri: string | null;
  imageUrl: string | null;
  observedAt: number;
  createdAt: number | null;
  creator: string | null;
  signature: string | null;
  initialBuySol: number | null;
  marketCapSol: number | null;
  dex: DexMarket | null;
  indexedAt: number | null;
};

export type TokenStreamStatus = {
  state: "idle" | "connecting" | "connected" | "reconnecting" | "error";
  source: NewTokenSource | null;
  label: string;
  message: string;
  connectedAt: number | null;
  retryAt: number | null;
};

export type TokenStreamSnapshot = {
  status: TokenStreamStatus;
  tokens: NewTokenItem[];
  generatedAt: number;
};

export type TokenStreamMessage =
  | { type: "snapshot"; snapshot: TokenStreamSnapshot }
  | { type: "status"; status: TokenStreamStatus }
  | { type: "token"; token: NewTokenItem }
  | { type: "update"; token: NewTokenItem };

export function streamSourceLabel(source: NewTokenSource | null) {
  if (source === "pumpportal") return "PumpPortal creation stream";
  if (source === "solana-rpc") return "Solana Pump creation stream";
  if (source === "dexscreener-profile") return "DEX Screener profile stream";
  return "new-token stream";
}
