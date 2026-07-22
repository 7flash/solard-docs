import {
  serverErrorResponse,
  serverMeasure,
} from "../../../src/observability/server";
import { getTokenFeed } from "../../../src/server/token-feed";

export async function GET() {
  try {
    return await serverMeasure.measure.assert(
      {
        label: "GET /api/dexscreener",
        budget: 4_000,
        result: (value: Response) => ({ status: value.status }),
      },
      async (m) => {
        const payload = await m("Build token snapshot", () => getTokenFeed());
        if (!payload) throw new Error("Token feed returned no payload.");
        return Response.json(payload, {
          headers: { "Cache-Control": "no-store" },
        });
      },
    );
  } catch (error) {
    return serverErrorResponse(error, 502);
  }
}
