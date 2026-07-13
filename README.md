# SOLARD landing — TradJS

A complete TradJS rebuild of the supplied SOLARD landing page. The project uses TradJS file-system routing and SSR for page content, plus explicit `tradjs/client` mount files for browser interactivity. There is no React dependency.

`tsconfig.json` uses TypeScript's `react-jsx` transform mode only to enable automatic JSX compilation; `jsxImportSource` points the runtime to `tradjs/client`.

## Run

```bash
bun install
bun run dev
```

Open `http://localhost:3000`.

## Production build

```bash
bun run build
```

## Structure

- `app/layout.tsx` — shared document shell and metadata
- `app/page.tsx` — server-rendered landing page
- `app/page.client.tsx` — ticker, calculator, copy controls, boot feed, reveal observers, and holder chart
- `app/docs/page.tsx` — internal docs companion route
- `app/terminal/page.tsx` + `page.client.tsx` — interactive sample terminal route
- `app/globals.css` — original visual system plus secondary-route styling
- `scripts/dev.ts` — explicit TradJS server startup on `PORT` or `3000`
- `reference/original-landing.html` — supplied source retained for comparison

TradJS is pinned to `4.2.0` for reproducible installs.
