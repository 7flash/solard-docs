import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { Solard } from "../target/types/solard";
import {
  PublicKey,
  SystemProgram,
  Keypair,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  getAccount,
} from "@solana/spl-token";
import * as fs from "fs";

const PROGRAM_ID = new PublicKey(
  "5cvRkbFXRozP2tZ9VW3xk3HCYZxcojsL69Lq2qzeSLRD",
);
const AUTHORITY = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(
      fs.readFileSync(
        process.env.HOME + "/.config/solana/mainnet.json",
        "utf-8",
      ),
    ),
  ),
);
const AMOUNT = 100_000_000; // 0.1 SOL

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Solard as Program<Solard>;
  const connection = provider.connection;

  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    PROGRAM_ID,
  );
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault")],
    PROGRAM_ID,
  );
  const ata = getAssociatedTokenAddressSync(NATIVE_MINT, AUTHORITY.publicKey);

  const tx = new Transaction();
  try {
    await getAccount(connection, ata);
  } catch {
    tx.add(
      createAssociatedTokenAccountInstruction(
        AUTHORITY.publicKey,
        ata,
        AUTHORITY.publicKey,
        NATIVE_MINT,
      ),
    );
  }
  tx.add(
    SystemProgram.transfer({
      fromPubkey: AUTHORITY.publicKey,
      toPubkey: ata,
      lamports: AMOUNT,
    }),
    createSyncNativeInstruction(ata),
  );
  await provider.sendAndConfirm(tx, [AUTHORITY]);
  console.log("Wrapped SOL");

  const fundTx = await program.methods
    .fundVault(new anchor.BN(AMOUNT))
    .accounts({
      funder: AUTHORITY.publicKey,
      global: globalPda,
      collateralMint: NATIVE_MINT,
      funderTokenAccount: ata,
      vault: vaultPda,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([AUTHORITY])
    .rpc();

  console.log("✅ Vault funded");
  console.log("Tx:", fundTx);
}
main().catch(console.error);
