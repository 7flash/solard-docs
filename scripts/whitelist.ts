import * as anchor from "@anchor-lang/core";
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
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

  const user = AUTHORITY.publicKey;
  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    PROGRAM_ID,
  );
  const [wlPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("whitelist"), user.toBuffer()],
    PROGRAM_ID,
  );

  const tx = await program.methods
    .setWhitelist(true)
    .accounts({
      authority: AUTHORITY.publicKey,
      user,
      global: globalPda,
      whitelistEntry: wlPda,
      systemProgram: SystemProgram.programId,
    })
    .signers([AUTHORITY])
    .rpc();

  console.log("✅ Whitelisted", user.toBase58());
  console.log("Tx:", tx);
}
main().catch(console.error);
