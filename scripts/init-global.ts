import * as anchor from "@anchor-lang/core";
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, NATIVE_MINT } from "@solana/spl-token";
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

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const idl = JSON.parse(fs.readFileSync("target/idl/solard.json", "utf-8"));
  const program = new anchor.Program(idl, provider);

  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    PROGRAM_ID,
  );
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault")],
    PROGRAM_ID,
  );

  console.log("Global:", globalPda.toBase58());
  console.log("Vault :", vaultPda.toBase58());

  const tx = await program.methods
    .initializeGlobal()
    .accounts({
      authority: AUTHORITY.publicKey,
      collateralMint: NATIVE_MINT,
      global: globalPda,
      vault: vaultPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([AUTHORITY])
    .rpc();

  console.log("✅ Global initialized:", tx);
}
main().catch(console.error);
