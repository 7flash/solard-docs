import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { SimplePerps } from "./idl/simple_perps.json"; // You need to copy your IDL here

export class TradJSClient {
  provider: AnchorProvider;
  program: Program<any>;

  constructor(walletAdapter: any, connection: Connection) {
    const wallet: Wallet = {
      publicKey: walletAdapter.publicKey,
      signTransaction: walletAdapter.signTransaction,
      signAllTransactions: walletAdapter.signAllTransactions,
    };

    this.provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

    this.program = new Program(
      SimplePerps as any,
      new PublicKey("Fg6PaFpoGXkYsidMpWxTWqozD2X6W2BeZ7FEfcYkgMQe"),
      this.provider
    );
  }

  async openPosition(params: any) {
    const { market, collateral, leverageBps, isLong, pumpswapBase, pumpswapQuote } = params;

    const [positionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("position"), market.toBuffer(), this.provider.wallet.publicKey!.toBuffer()],
      this.program.programId
    );

    return this.program.methods
      .openPosition(
        new (require("@coral-xyz/anchor").BN)(collateral * 1e9),
        new (require("@coral-xyz/anchor").BN)(leverageBps),
        isLong ? { long: {} } : { short: {} }
      )
      .accounts({
        owner: this.provider.wallet.publicKey,
        market,
        position: positionPda,
        collateralMint: new PublicKey("So11111111111111111111111111111111111111112"), // WSOL example
        ownerTokenAccount: /* derive WSOL ATA */,
        vault: /* derive vault */,
        pumpswapPool: market,
        poolBaseToken: pumpswapBase,
        poolQuoteToken: pumpswapQuote,
        tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        systemProgram: new PublicKey("11111111111111111111111111111111"),
      })
      .rpc();
  }

  async closePosition(market: PublicKey) {
    const [positionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("position"), market.toBuffer(), this.provider.wallet.publicKey!.toBuffer()],
      this.program.programId
    );

    return this.program.methods
      .closePosition()
      .accounts({
        owner: this.provider.wallet.publicKey,
        market,
        position: positionPda,
        // ... fill other accounts
      })
      .rpc();
  }
}