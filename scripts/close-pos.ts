import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { Solard } from "../target/types/solard";
import { PublicKey, Keypair } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  getAssociatedTokenAddressSync,
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

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Solard as Program<Solard>;

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
  const [wlPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("whitelist"), USER.publicKey.toBuffer()],
    PROGRAM_ID,
  );
  const ata = getAssociatedTokenAddressSync(NATIVE_MINT, USER.publicKey);

  const tx = await program.methods
    .closePosition(new anchor.BN(0))
    .accounts({
      owner: USER.publicKey,
      global: globalPda,
      whitelistEntry: wlPda,
      pool: POOL,
      poolBaseToken: POOL_BASE,
      poolQuoteToken: POOL_QUOTE,
      baseMint: BASE_MINT,
      position: positionPda,
      collateralMint: NATIVE_MINT,
      ownerTokenAccount: ata,
      vault: vaultPda,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([USER])
    .rpc();

  console.log("✅ Position closed");
  console.log("Tx:", tx);
}
main().catch(console.error);
