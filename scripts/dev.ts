import { serve } from "tradjs/web";
import { tokenStreamManager } from "../app/lib/token-stream-server";

// Start discovery with the server process, not with the first browser click or
// the first SSE subscriber. New arrivals can already be buffered when a page opens.
tokenStreamManager.ensureStarted();

const port = Number(process.env.BUN_PORT ?? process.env.PORT ?? 3000);
await serve({ appDir: "./app", port });
await new Promise(() => {});
