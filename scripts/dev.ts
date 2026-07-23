import { serve } from "tradjs/web";

const port = Number(process.env.BUN_PORT ?? process.env.PORT ?? 3000);
const startIndexer = process.env.SOLARD_START_INDEXER !== "0";
let indexer: ReturnType<typeof Bun.spawn> | null = null;

if (startIndexer) {
  indexer = Bun.spawn(["bun", "run", "sqd/migrated-pumpswap.ts"], {
    cwd: process.cwd(),
    env: process.env,
    stdout: "inherit",
    stderr: "inherit",
  });
  console.log(`[dev] SQD indexer pid=${indexer.pid}`);
}

const stop = () => {
  try {
    indexer?.kill();
  } catch {
    // Process may already have exited.
  }
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
process.once("exit", stop);

await serve({ appDir: "./app", port });
await new Promise(() => {});
