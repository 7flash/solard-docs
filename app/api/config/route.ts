import { traceLabel } from "../../../src/observability/action";
import {
  serverErrorResponse,
  serverMeasure,
} from "../../../src/observability/server";

function configuredRpcMaxRps(): number {
  const value = Number(Bun.env.PUBLIC_RPC_MAX_RPS || 1);
  return Number.isFinite(value) ? Math.max(1, Math.min(2, value)) : 1;
}

const defaults = {
  rpcUrl: "https://api.mainnet-beta.solana.com",
  rpcMaxRps: 1,
  cluster: "mainnet-beta",
  programId: "5cvRkbFXRozP2tZ9VW3xk3HCYZxcojsL69Lq2qzeSLRD",
  pumpSwapProgramId: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
  collateralSymbol: "SOL",
  explorerBase: "https://solscan.io",
};

export async function GET() {
  try {
    return await serverMeasure(traceLabel("GET /api/config"), async () =>
      Response.json(
        {
          rpcUrl: Bun.env.PUBLIC_SOLANA_RPC_URL || defaults.rpcUrl,
          rpcMaxRps: configuredRpcMaxRps(),
          cluster: Bun.env.PUBLIC_SOLANA_CLUSTER || defaults.cluster,
          programId: Bun.env.PUBLIC_PROGRAM_ID || defaults.programId,
          pumpSwapProgramId:
            Bun.env.PUBLIC_PUMPSWAP_PROGRAM_ID || defaults.pumpSwapProgramId,
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
