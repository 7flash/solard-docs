import { traceLabel } from "../../../src/observability/action";
import { errorRecord } from "../../../src/observability/error";
import { serverMeasure } from "../../../src/observability/server";
import { getTokenFeed } from "../../../src/server/token-feed";
import type { TokenFeedPayload } from "../../../src/types";

const POLL_AFTER_MS = 10_000;
const BUILD_VERSION = "5.4.0";

function responseHeaders(
  etag: string,
  degraded = false,
): Record<string, string> {
  return {
    "Cache-Control": "no-store, max-age=0",
    ETag: etag,
    Vary: "If-None-Match",
    "X-Poll-After-Ms": String(POLL_AFTER_MS),
    "X-Feed-Degraded": degraded ? "1" : "0",
    "X-Solard-Build": BUILD_VERSION,
  };
}

function payloadEtag(payload: TokenFeedPayload): string {
  const tokens = Array.isArray(payload.tokens) ? payload.tokens : [];
  const fingerprint = JSON.stringify(
    tokens.map((token) => [
      token.mint,
      token.pairAddress,
      token.pairCreatedAt,
      token.dexId,
      token.priceUsd,
      token.marketCap,
      token.liquidityUsd,
      token.volumeM5,
      token.buysM5,
      token.sellsM5,
    ]),
  );
  let hash = 2_166_136_261;
  for (let index = 0; index < fingerprint.length; index += 1) {
    hash ^= fingerprint.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `W/"${(hash >>> 0).toString(36)}-${tokens.length.toString(36)}"`;
}

function degradedPayload(error: unknown): TokenFeedPayload {
  const detail = errorRecord(error);
  return {
    tokens: [],
    updatedAt: Date.now(),
    source: "degraded polling fallback",
    warning: `Token discovery is temporarily unavailable: ${detail.message}`,
  };
}

export async function GET(request: Request) {
  const ifNoneMatch = request.headers.get("if-none-match");
  try {
    return await serverMeasure(
      traceLabel("GET /api/tokens", { ifNoneMatch, build: BUILD_VERSION }),
      async () => {
        const payload = await serverMeasure(
          "Build token polling snapshot",
          () => getTokenFeed(),
        );
        if (!payload || !Array.isArray(payload.tokens))
          throw new Error("Token feed returned an invalid payload.");

        const etag = payloadEtag(payload);
        const degraded = Boolean(
          payload.warning && payload.tokens.length === 0,
        );
        if (ifNoneMatch === etag) {
          serverMeasure.note(
            traceLabel("Token polling snapshot not modified", {
              etag,
              tokens: payload.tokens.length,
              degraded,
            }),
          );
          return new Response(null, {
            status: 304,
            headers: responseHeaders(etag, degraded),
          });
        }

        return Response.json(payload, {
          status: 200,
          headers: {
            ...responseHeaders(etag, degraded),
            "X-Feed-Updated-At": String(payload.updatedAt),
          },
        });
      },
    );
  } catch (error) {
    const payload = degradedPayload(error);
    const etag = payloadEtag(payload);
    serverMeasure.note(
      traceLabel("Serve degraded token polling snapshot", {
        error: errorRecord(error).message,
        build: BUILD_VERSION,
      }),
    );
    return Response.json(payload, {
      status: 200,
      headers: {
        ...responseHeaders(etag, true),
        "X-Feed-Updated-At": String(payload.updatedAt),
      },
    });
  }
}
