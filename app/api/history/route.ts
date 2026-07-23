import { marketDatabase } from "../../../shared/market-db";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mine = url.searchParams.get("mine") === "1";
  const owner = mine
    ? url.searchParams.get("owner")?.trim() || undefined
    : undefined;
  const limit = Math.max(
    1,
    Math.min(250, Number(url.searchParams.get("limit") || 100)),
  );
  const activity = marketDatabase()
    .listActivity(owner, limit)
    .map((row) => ({
      id: row.id,
      signature: row.signature,
      instructionAddress: row.instruction_address,
      instruction: row.instruction,
      owner: row.owner,
      positionPda: row.position_pda,
      baseMint: row.base_mint,
      pool: row.pool,
      side: row.side,
      collateralAmount: row.collateral_amount,
      leverageBps: row.leverage_bps,
      priceLimitE6: row.price_limit_e6,
      minPayout: row.min_payout,
      slot: row.slot,
      timestampMs: row.timestamp_ms,
    }));
  return Response.json(
    { activity, updatedAt: Date.now() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
