import { Head } from "tradjs/web";

export const ssg = true;

export default function TerminalPage() {
  return (
    <>
      <Head>
        <title>SOLARD — live new-token stream</title>
        <meta name="description" content="A server-streamed Solana new-token feed with PumpPortal creation events or DEX Screener profile events, plus delayed DEX pair enrichment." />
        <meta property="og:title" content="SOLARD — live new-token stream" />
      </Head>
      <main className="terminal-page live-terminal-page token-terminal-page">
        <div className="wrap">
          <div className="terminal-nav">
            <a className="back" href="/">← back to landing</a>
            <div><a href="/docs#market-data">stream docs</a><a href="https://dexscreener.com/" target="_blank" rel="noreferrer">DEX Screener ↗</a></div>
          </div>
          <div className="terminal-top">
            <div>
              <div className="tag">server-streamed discovery + delayed pair enrichment</div>
              <h1>NEW TOKEN TERMINAL</h1>
              <p>Creation/profile events arrive over SSE. Price and liquidity appear only after DEX Screener indexes a pair.</p>
            </div>
            <div className="terminal-actions" id="terminal-controls" />
          </div>
          <div id="terminal-dashboard" aria-live="polite" />
          <div className="terminal-disclaimer">
            PumpPortal mode represents Pump/PumpSwap token creation events. DEX Screener fallback mode represents newly created token profiles and is not a complete on-chain launch feed. Pair metrics can be delayed or absent. Nothing on this page is financial advice.
          </div>
        </div>
      </main>
    </>
  );
}
