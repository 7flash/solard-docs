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
const USER = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(
      fs.readFileSync(
        process.env.HOME + "/.config/solana/mainnet.json",
        "utf-8",
      ),
    ),
  ),
);

const POOL = new PublicKey("33zaVxn4PGUtQq4BmViKSxZ8UatMz3kVdFxb1JeFHMXS");
const POOL_BASE = new PublicKey("DF71yXAaqLrPDa8dJJQ3GJTSQTV4httfjbPKSqxWgVRG");
const POOL_QUOTE = new PublicKey(
  "6ectDPoSDKq9ZxaLfY6P5W2xEMK38uaWLbjsQtajH8tM",
);
const BASE_MINT = new PublicKey("47M2U1eVot6VPWjcqEFWe2CesUTBGBXfSDovaqTmpump");

const COLLATERAL = 10_000_000; // 0.01 SOL
const LEVERAGE_BPS = 50_000; // 5x
const PRICE_LIMIT = 10_000_000_000;

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
  const [positionPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), USER.publicKey.toBuffer(), BASE_MINT.toBuffer()],
    PROGRAM_ID,
  );
  const ata = getAssociatedTokenAddressSync(NATIVE_MINT, USER.publicKey);

  const tx = new Transaction();
  try {
    await getAccount(connection, ata);
  } catch {
    tx.add(
      createAssociatedTokenAccountInstruction(
        USER.publicKey,
        ata,
        USER.publicKey,
        NATIVE_MINT,
      ),
    );
  }
  tx.add(
    SystemProgram.transfer({
      fromPubkey: USER.publicKey,
      toPubkey: ata,
      lamports: COLLATERAL,
    }),
    createSyncNativeInstruction(ata),
  );
  await provider.sendAndConfirm(tx, [USER]);
  console.log("Wrapped 0.01 SOL");
  console.log("Position PDA:", positionPda.toBase58());

  const openTx = await program.methods
    .openPosition(
      new anchor.BN(COLLATERAL),
      LEVERAGE_BPS,
      { long: {} },
      new anchor.BN(PRICE_LIMIT),
    )
    .accounts({
      owner: USER.publicKey,
      global: globalPda,
      pool: POOL,
      poolBaseToken: POOL_BASE,
      poolQuoteToken: POOL_QUOTE,
      baseMint: BASE_MINT,
      collateralMint: NATIVE_MINT,
      ownerTokenAccount: ata,
      vault: vaultPda,
      position: positionPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([USER])
    .rpc();

  console.log("✅ Long opened");
  console.log("Tx:", openTx);
}
main().catch(console.error);
