import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import * as fs from "fs";
import {
  loadProgram,
  positionPda,
  getLivePrice,
  calcPnl,
  SOLARD,
  GLOBAL_PDA,
  VAULT_PDA,
} from "./lib/solard-client";

async function main() {
  const owner = process.argv[2]
    ? new PublicKey(process.argv[2])
    : Keypair.fromSecretKey(
        Uint8Array.from(
          JSON.parse(
            fs.readFileSync(
              process.env.HOME + "/.config/solana/mainnet.json",
              "utf-8",
            ),
          ),
        ),
      ).publicKey;

  const program = loadProgram();
  const connection = program.provider.connection as Connection;

  const posPda = positionPda(owner, SOLARD.mint);
  console.log("Owner   :", owner.toBase58());
  console.log("Position:", posPda.toBase58());

  let pos: any;
  try {
    pos = await (program.account as any).position.fetch(posPda);
  } catch {
    console.log("No open position");
    return;
  }

  const side = pos.side.long !== undefined ? "long" : "short";
  const entry = Number(pos.entryPriceE6);
  const collateral = Number(pos.collateralAmount);
  const notional = Number(pos.notionalAmount);

  const { priceE6: live } = await getLivePrice(
    connection,
    SOLARD.poolBase,
    SOLARD.poolQuote,
    SOLARD.baseDecimals,
  );

  const pnl = calcPnl(notional, entry, live, side);
  const equity = Math.max(0, collateral + pnl);
  const pnlPct = collateral > 0 ? (pnl / collateral) * 100 : 0;

  console.log("---");
  console.log("Side       :", side);
  console.log("Collateral :", collateral / 1e9, "SOL");
  console.log("Notional   :", notional / 1e9, "SOL");
  console.log("Entry e6   :", entry);
  console.log("Live e6    :", live);
  console.log("Unrealized :", pnl / 1e9, "SOL", `(${pnlPct.toFixed(2)}%)`);
  console.log("Equity     :", equity / 1e9, "SOL");
  console.log("Opened slot:", Number(pos.openedSlot));

  // Vault health
  const vaultBal = await connection.getTokenAccountBalance(VAULT_PDA);
  console.log("---");
  console.log("Vault SOL  :", vaultBal.value.uiAmountString);
}

main().catch(console.error);
