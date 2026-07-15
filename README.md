# SOLARD web and terminal guide

This package contains the TradJS landing page, documentation, and browser routes for [SOLARD](https://github.com/7flash/solard). Follow project updates at [x.com/solardxyz](https://x.com/solardxyz).

The important startup distinction is simple:

- `bun run indexer/main.ts` starts market ingestion and writes local state.
- `bunx tradjs server` serves the browser terminal and documentation.
- `solard` is the CLI. It is not the terminal launcher.

## Run the full SOLARD terminal

Run these commands from the root of the actual SOLARD repository.

### 1. Install and configure

```bash
git clone https://github.com/7flash/solard
cd solard
bun install
cp .env.example .env
```

Configure the required RPC and wallet-encryption settings in `.env`. Keep live execution disabled while testing:

```env
SOLARD_ENABLE_LIVE_TRADES=0
```

### 2. Start the indexer

Open the first shell and leave it running:

```bash
bun run indexer/main.ts
```

The indexer owns ingestion and updates the SQLite-backed market state used by the terminal.

### 3. Start the TradJS server

Open a second shell in the same repository:

```bash
export BUN_PORT=3000
bunx tradjs server
```

Then open `http://localhost:3000`.

PowerShell:

```powershell
$env:BUN_PORT = "3000"
bunx tradjs server
```

Starting only TradJS serves the interface, but current indexed data requires the indexer process to be running too.

## CLI

The CLI is a separate operator interface:

```bash
solard help
```

Use it for repeatable wallet, token, quote, trade, launch, worker, watch, and script workflows. Begin with simulations and keep `SOLARD_ENABLE_LIVE_TRADES=0` until the complete path has been reviewed.

## Web routes

- `/` — landing page
- `/docs` — searchable documentation
- `/terminal` — terminal interface
- `/api/dexscreener` — normalized DEX pair data
- `/api/token-stream` — terminal event stream

## Project structure

```text
app/
  page.tsx                 landing page
  docs/                    documentation route
  terminal/                browser terminal
  api/                     server routes
  lib/                     market-data helpers
scripts/
  dev.ts                   local wrapper used by this standalone web package
```

## Standalone web-layer development

This ZIP is a web-layer package and does not include the upstream repository's `indexer/` implementation. To work only on the pages in this package, install dependencies and start TradJS directly:

```bash
bun install
export BUN_PORT=3000
bunx tradjs server
```

For the actual terminal with advancing market state, place/use the web layer in the complete SOLARD repository and run both processes described above.

## Production notes

- Keep the terminal bound to localhost unless remote access is protected.
- Use a VPN or SSH tunnel instead of exposing the operator interface directly.
- Configure a dedicated Solana/Helius RPC for reliable indexing.
- Preserve long-lived HTTP connections if `/api/token-stream` is proxied.
- Back up the SQLite database and protect `SOLARD_MASTER_KEY`.
- Review simulations, wallet selection, slippage, priority fees, and sender configuration before enabling live execution.

## License

Follow the license and notices in the upstream SOLARD repository.
