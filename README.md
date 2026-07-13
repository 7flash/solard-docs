# SOLARD landing + docs — TradJS

A complete TradJS rebuild of the supplied SOLARD landing and documentation pages. The project uses TradJS file-system routing and server-rendered JSX, plus explicit `tradjs/client` route mounts for browser behavior. There is no React dependency.

`tsconfig.json` uses TypeScript's `react-jsx` transform mode only to enable automatic JSX compilation; `jsxImportSource` points the runtime to `tradjs/client`.

## Run

```bash
bun install
bun run dev
```

Open `http://localhost:3000`.

## Routes

- `/` — marketing landing
- `/docs` — full documentation page with sticky navigation, scrollspy, copyable command blocks, tables, callouts, and route-specific metadata
- `/terminal` — interactive sample terminal

## Production build

```bash
bun run build
```

## Structure

- `app/layout.tsx` — shared document shell, favicon, and font links
- `app/page.tsx` — server-rendered landing and landing metadata
- `app/page.client.tsx` — ticker, calculator, copy controls, boot feed, reveal observers, and holder chart
- `app/docs/page.tsx` — server-rendered documentation route and docs metadata
- `app/docs/content.ts` — trusted static docs markup derived from the supplied mockup
- `app/docs/page.client.tsx` — code-copy controls and sidebar scrollspy
- `app/terminal/page.tsx` + `page.client.tsx` — interactive sample terminal route
- `app/globals.css` — shared landing styles plus route-scoped docs and terminal styles
- `scripts/dev.ts` — explicit TradJS server startup on `PORT` or `3000`
- `reference/original-landing.html` — supplied landing source retained for comparison
- `reference/original-docs.html` — supplied docs source retained for comparison

TradJS is pinned to `4.2.0` for reproducible installs.
