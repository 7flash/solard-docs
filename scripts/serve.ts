import { serve } from "tradjs/web";

const port = Number(process.env.BUN_PORT ?? process.env.PORT ?? 3000);
await serve({ appDir: "./app", port });
await new Promise(() => {});
