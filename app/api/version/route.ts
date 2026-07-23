import { traceLabel } from "../../../src/observability/action";
import {
  serverMeasure,
  serverMeasureCapabilities,
} from "../../../src/observability/server";

const BUILD = {
  name: "solard-trade-app",
  version: "7.4.0-sqd-latest-seeds",
  feedTransport: "sqlite-polling",
  indexer: "SQD Pump migrate + SOLARD",
  observability: serverMeasureCapabilities,
} as const;

export async function GET() {
  return serverMeasure(
    traceLabel("GET /api/version", { version: BUILD.version }),
    async () =>
      Response.json(BUILD, {
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "X-Solard-Build": BUILD.version,
        },
      }),
  );
}
