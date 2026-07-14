import { serve } from "tradjs/web";

const port = Number(process.env.BUN_PORT ?? null);
await serve({ appDir: "./app", port });
await new Promise(() => {});
