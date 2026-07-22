import { traceLabel } from "../../../src/observability/action";
import {
  serverErrorResponse,
  serverMeasure,
} from "../../../src/observability/server";

const defaults = {
  rpcUrl: "https://api.mainnet-beta.solana.com",
  cluster: "mainnet-beta",
  programId: "5cvRkbFXRozP2tZ9VW3xk3HCYZxcojsL69Lq2qzeSLRD",
  marketAddress: "21yRg8vY3hQz8tbB5NjawiXVj2yY3q82aEWwiuYRSpxJ",
  vaultAddress: "3jPWVp8hec8yJ2kkazqsPD7Q3d7nkcvkpvirTQ2dX7tZ",
  marketSymbol: "SOLARD",
  collateralSymbol: "COLLATERAL",
  explorerBase: "https://solscan.io",
};

export async function GET() {
  try {
    return await serverMeasure(traceLabel("GET /api/config"), async () =>
      Response.json(
        {
          rpcUrl: Bun.env.PUBLIC_SOLANA_RPC_URL || defaults.rpcUrl,
          cluster: Bun.env.PUBLIC_SOLANA_CLUSTER || defaults.cluster,
          programId: Bun.env.PUBLIC_PROGRAM_ID || defaults.programId,
          marketAddress:
            Bun.env.PUBLIC_MARKET_ADDRESS || defaults.marketAddress,
          vaultAddress: Bun.env.PUBLIC_VAULT_ADDRESS || defaults.vaultAddress,
          marketSymbol: Bun.env.PUBLIC_MARKET_SYMBOL || defaults.marketSymbol,
          collateralSymbol:
            Bun.env.PUBLIC_COLLATERAL_SYMBOL || defaults.collateralSymbol,
          explorerBase: Bun.env.PUBLIC_EXPLORER_BASE || defaults.explorerBase,
        },
        { headers: { "Cache-Control": "no-store" } },
      ),
    );
  } catch (error) {
    return serverErrorResponse(error);
  }
}
