import { PublicKey } from "@solana/web3.js";

export const MEMECOINS = [
  {
    symbol: "WIF",
    name: "dogwifhat",
    marketPda: new PublicKey("YOUR_MARKET_PDA_HERE"),
    baseTokenAccount: new PublicKey("YOUR_BASE_TOKEN_ACCOUNT"),
    quoteTokenAccount: new PublicKey("YOUR_QUOTE_TOKEN_ACCOUNT"),
    logo: "",
  },
  {
    symbol: "POPCAT",
    name: "Popcat",
    marketPda: new PublicKey("YOUR_MARKET_PDA_HERE"),
    baseTokenAccount: new PublicKey("YOUR_BASE_TOKEN_ACCOUNT"),
    quoteTokenAccount: new PublicKey("YOUR_QUOTE_TOKEN_ACCOUNT"),
    logo: "",
  },
];
