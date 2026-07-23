import { marketDatabase } from "../../../shared/market-db";
import { traceLabel } from "../../../src/observability/action";
import {
  serverMeasure,
  serverErrorResponse,
} from "../../../src/observability/server";

export async function GET() {
  try {
    return await serverMeasure(traceLabel("GET /api/index-status"), async () =>
      Response.json(
        { ...marketDatabase().indexSummary(), updatedAt: Date.now() },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      ),
    );
  } catch (error) {
    return serverErrorResponse(error);
  }
}
