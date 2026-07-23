// scripts/view-history.ts
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import * as fs from "fs";
import { PROGRAM_ID } from "./lib/solard-client";

const RPC =
  process.env.ANCHOR_PROVIDER_URL || "https://api.mainnet-beta.solana.com";

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

  const connection = new Connection(RPC, "confirmed");
  const sigs = await connection.getSignaturesForAddress(owner, { limit: 40 });

  console.log(`Recent program txs for ${owner.toBase58()}\n`);

  for (const s of sigs) {
    const tx = await connection.getParsedTransaction(s.signature, {
      maxSupportedTransactionVersion: 0,
    });
    if (!tx?.meta?.logMessages) continue;

    const logs = tx.meta.logMessages.join("\n");
    if (!logs.includes(PROGRAM_ID.toBase58())) continue;

    let kind = "?";
    if (logs.includes("Instruction: OpenPosition")) kind = "OPEN";
    else if (logs.includes("Instruction: ClosePosition")) kind = "CLOSE";
    else if (logs.includes("Instruction: FundVault")) kind = "FUND";
    else if (logs.includes("Instruction: SetWhitelist")) kind = "WL";
    else if (logs.includes("Instruction: InitializeGlobal")) kind = "INIT";
    else continue;

    const status = tx.meta.err ? "FAIL" : "OK";
    const time = s.blockTime ? new Date(s.blockTime * 1000).toISOString() : "?";
    console.log(`${time}  ${kind.padEnd(6)}  ${status}  ${s.signature}`);
  }
}

main().catch(console.error);
