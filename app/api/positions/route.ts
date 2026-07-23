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
  const positions = marketDatabase()
    .listPositions(owner, limit)
    .map((row) => ({
      positionPda: row.position_pda,
      owner: row.owner,
      baseMint: row.base_mint,
      pool: row.pool,
      side: row.side,
      collateralAmount: row.collateral_amount,
      leverageBps: row.leverage_bps,
      notionalAmount: row.notional_amount,
      entryPriceE6: row.entry_price_e6,
      openedSlot: row.opened_slot,
      openedAt: row.opened_at_ms,
      openSignature: row.open_signature,
    }));
  return Response.json(
    { positions, updatedAt: Date.now() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
