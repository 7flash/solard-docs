import { traceLabel } from "../../../src/observability/action";
import {
  serverMeasure,
  serverMeasureCapabilities,
} from "../../../src/observability/server";

const BUILD = {
  name: "solard-tradjs-terminal",
  version: "5.4.0",
  feedTransport: "polling",
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
