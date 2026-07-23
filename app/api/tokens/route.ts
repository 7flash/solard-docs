import { traceLabel } from "../../../src/observability/action";
import { errorRecord } from "../../../src/observability/error";
import { serverMeasure } from "../../../src/observability/server";
import {
  getPumpSwapTokenByMint,
  getTokenFeed,
  searchPumpSwapTokens,
} from "../../../src/server/token-feed";
import type { TokenFeedPayload } from "../../../src/types";

const POLL_AFTER_MS = 2_000;
const BUILD_VERSION = "7.5.0-hot-migrations-search";

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
      token.tokenCreatedAt,
      token.dexId,
      token.priceUsd,
      token.marketCap,
      token.liquidityUsd,
      token.marketCapSol,
      token.liquiditySol,
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
  const requestUrl = new URL(request.url);
  const mint = requestUrl.searchParams.get("mint")?.trim() || "";
  const query = requestUrl.searchParams.get("q")?.trim() || "";
  try {
    if (query) {
      const tokens = await searchPumpSwapTokens(query, 12);
      return Response.json(
        { tokens },
        {
          headers: {
            "Cache-Control": "no-store, max-age=0",
            "X-Solard-Build": BUILD_VERSION,
          },
        },
      );
    }
    if (mint) {
      const token = await getPumpSwapTokenByMint(mint);
      return Response.json(
        { token },
        {
          headers: {
            "Cache-Control": "no-store, max-age=0",
            "X-Solard-Build": BUILD_VERSION,
          },
        },
      );
    }

    return await serverMeasure(
      traceLabel("GET /api/tokens", { ifNoneMatch, build: BUILD_VERSION }),
      async () => {
        // The SQD database contains only canonical Pump migrations into WSOL
        // PumpSwap pools. Raw Pump create events never enter this response.
        const url = new URL(request.url);
        const list = (name: string) =>
          (url.searchParams.get(name) || "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
            .slice(0, 40);
        const payload = await serverMeasure(
          "Build indexed token polling snapshot",
          () =>
            getTokenFeed({
              selected: list("selected"),
              open: list("open"),
              visible: list("visible"),
              pinned: list("pinned"),
            }),
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
