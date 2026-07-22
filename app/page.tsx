import { Head } from "tradjs/web";

export const ssg = true;

const Mark = ({
  size = 18,
  className = "mark",
}: {
  size?: number;
  className?: string;
}) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 32 32"
    aria-hidden="true"
  >
    <path d="M10.5 4h16l-3.4 5h-16z" />
    <path d="M7.1 13.5h16l3.4 5h-16z" />
    <path d="M10.5 23h16l-3.4 5h-16z" />
  </svg>
);

const FeatureCard = ({
  number,
  title,
  children,
  featured = false,
}: {
  number: string;
  title: string;
  children: string;
  featured?: boolean;
}) => (
  <article className={`v4-feature-card${featured ? " featured" : ""}`}>
    <span>{number}</span>
    <h3>{title}</h3>
    <p>{children}</p>
  </article>
);

function PerpsPreview() {
  return (
    <div
      className="v4-intel-window"
      aria-label="Illustrative SOLARD perps trade panel"
    >
      <div className="v4-window-head">
        <div>
          <i /> SOLARD-PERP
        </div>
        <span>on-chain · live</span>
      </div>
      <div className="v4-intel-stats">
        <div>
          <span>mark</span>
          <b>$0.0842</b>
        </div>
        <div>
          <span>side</span>
          <b className="grn">LONG</b>
        </div>
        <div>
          <span>leverage</span>
          <b>8×</b>
        </div>
        <div>
          <span>liq</span>
          <b>$0.0711</b>
        </div>
      </div>
      <div className="v4-supply-chart" style={{ padding: "18px 16px 12px" }}>
        <div
          style={{ display: "grid", gap: 10, fontSize: 12, color: "#8f8f8f" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>collateral</span>
            <b style={{ color: "#f2f2f2" }}>2.50 SOL</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>notional</span>
            <b style={{ color: "#f2f2f2" }}>20.00 SOL</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>oracle</span>
            <b style={{ color: "#1fd35f" }}>PumpSwap pool</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>settlement</span>
            <b style={{ color: "#f2f2f2" }}>fully on-chain</b>
          </div>
          <div
            style={{
              marginTop: 8,
              border: "1px solid #0f4d26",
              background: "rgba(31,211,95,.08)",
              color: "#1fd35f",
              textAlign: "center",
              padding: "12px 0",
              fontWeight: 600,
              letterSpacing: ".08em",
            }}
          >
            OPEN LONG →
          </div>
        </div>
      </div>
      <div className="v4-filter-preview">
        <div className="v4-filter-bar">
          <span>program</span>
          <code style={{ color: "#1fd35f", fontSize: 11 }}>5cvRkbFX…SLRD</code>
        </div>
        <div className="v4-filter-result">
          <b>wallet signs</b>
          <span>position PDA + vault</span>
          <i>no custodian</i>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      <Head>
        <title>SOLARD — on-chain perps for every memecoin</title>
        <meta
          name="description"
          content="Trade long and short perpetuals on any Solana memecoin. Fully on-chain SOLARD markets marked to PumpSwap, with an open-source terminal for discovery."
        />
        <meta
          property="og:title"
          content="SOLARD — on-chain perps for every memecoin"
        />
        <meta
          property="og:description"
          content="Fully on-chain memecoin perpetuals. Long or short any token. Open positions from /trade."
        />
      </Head>

      <div className="landing-v4" id="top">
        <header className="v4-header">
          <div className="wrap">
            <nav className="v4-nav" aria-label="Primary navigation">
              <a className="v4-brand" href="#top" aria-label="SOLARD home">
                <Mark />
                <span>SOLARD</span>
              </a>
              <div className="v4-nav-links">
                <a href="#perps" data-s="perps">
                  Perps
                </a>
                <a href="#onchain" data-s="onchain">
                  On-chain
                </a>
                <a href="#terminal" data-s="terminal">
                  Terminal
                </a>
                <a href="/docs">Docs</a>
                <a
                  href="https://github.com/7flash/solard"
                  target="_blank"
                  rel="noreferrer"
                >
                  GitHub
                </a>
                <a
                  className="v4-x-link"
                  href="https://x.com/solardxyz"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Follow SOLARD on X"
                >
                  X · @solardxyz ↗
                </a>
                <a className="v4-nav-cta" href="/trade">
                  Trade Perps →
                </a>
              </div>
            </nav>
          </div>
        </header>

        <main>
          <section className="v4-hero">
            <div className="wrap">
              <div className="v4-hero-grid">
                <div className="v4-hero-copy rv">
                  <div className="v4-badge">
                    fully on-chain · memecoin perps · solana
                  </div>
                  <h1>
                    Long or short
                    <br />
                    any memecoin.
                  </h1>
                  <p className="v4-lede">
                    SOLARD perps let you trade leveraged long and short
                    positions on Solana memecoins — marked to live PumpSwap
                    pools, settled on-chain, signed in your wallet. No
                    custodian. No platform cut on the protocol path.
                  </p>
                  <p>
                    Open a market, post collateral, choose leverage, and submit.
                    Positions, liquidations, and payouts run through the SOLARD
                    program — not a hosted order book.
                  </p>
                  <div className="v4-actions">
                    <a className="v4-button primary" href="/trade">
                      Trade Perps →
                    </a>
                    <a className="v4-button secondary" href="/terminal">
                      Open Terminal
                    </a>
                    <a className="v4-button ghost" href="#onchain">
                      How it works
                    </a>
                  </div>
                </div>
                <PerpsPreview />
              </div>
            </div>
          </section>

          <section className="v4-section" id="perps">
            <div className="wrap rv">
              <div className="v4-heading">
                <span className="v4-kicker">memecoin perps</span>
                <h2>Built for the tokens that actually move.</h2>
                <p>
                  Most perp venues list a handful of majors. SOLARD is designed
                  so any memecoin with a PumpSwap pool can become a perpetual
                  market — discoverable from the same stack that watches new
                  launches.
                </p>
              </div>
              <div className="v4-feature-grid">
                <FeatureCard number="01" title="Any memecoin market" featured>
                  Markets point at PumpSwap pool reserves. When a token has deep
                  enough liquidity, SOLARD can price and settle a perp against
                  it — not only a curated blue-chip list.
                </FeatureCard>
                <FeatureCard number="02" title="Long and short">
                  Go long into a run or short a dump. Collateral stays in the
                  market vault; size and side are recorded on a position PDA
                  owned by your wallet.
                </FeatureCard>
                <FeatureCard number="03" title="Leverage with explicit risk">
                  Choose leverage within the market’s on-chain max. Liquidation
                  price and maintenance margin are computed from the same
                  parameters the program enforces.
                </FeatureCard>
                <FeatureCard number="04" title="0% SOLARD application fee">
                  Hosted frontends often take a cut of every trade. The SOLARD
                  path is built so you pay network, venue, and priority costs —
                  not a platform toll on top.
                </FeatureCard>
              </div>
            </div>
          </section>

          <section className="v4-section" id="onchain">
            <div className="wrap rv">
              <div className="v4-heading">
                <span className="v4-kicker">fully on-chain</span>
                <h2>Your wallet is the only account that matters.</h2>
                <p>
                  SOLARD perps are not a synthetic book behind an API key.
                  Markets, vaults, and positions are Solana accounts. Opening or
                  closing a position is a transaction you sign.
                </p>
              </div>
              <div className="v4-core-grid">
                {[
                  [
                    "01",
                    "Program-owned vaults",
                    "Collateral moves into the market vault under program authority. Payouts return to your token account on close or liquidation.",
                  ],
                  [
                    "02",
                    "PumpSwap mark price",
                    "Mark is derived from pool base/quote reserves (and optional oracle updates). What you see in the UI is grounded in on-chain state.",
                  ],
                  [
                    "03",
                    "Position PDAs",
                    "Each open position is a deterministic PDA tied to your wallet and market. No off-chain ledger to reconcile later.",
                  ],
                  [
                    "04",
                    "Liquidations on-chain",
                    "When maintenance margin fails, anyone can liquidate. Rewards and remaining equity follow the program rules — not a support ticket.",
                  ],
                  [
                    "05",
                    "Wallet-native signing",
                    "Phantom, Solflare, Backpack, and other injected wallets sign locally. SOLARD never holds your keys.",
                  ],
                  [
                    "06",
                    "Transparent parameters",
                    "Max leverage, maintenance margin, open-interest caps, and pause/settlement flags live on the market account — readable by anyone.",
                  ],
                ].map(([n, t, d]) => (
                  <article key={n} className="v4-core-item">
                    <span className="v4-number">{n}</span>
                    <h3>{t}</h3>
                    <p>{d}</p>
                  </article>
                ))}
              </div>
              <div className="v4-actions" style={{ marginTop: 36 }}>
                <a className="v4-button primary" href="/trade">
                  Open the trade UI →
                </a>
                <a className="v4-button secondary" href="/docs">
                  Read the program docs
                </a>
              </div>
            </div>
          </section>

          <section className="v4-section" id="terminal">
            <div className="wrap rv">
              <div className="v4-heading">
                <span className="v4-kicker">open-source terminal</span>
                <h2>Discovery and execution infrastructure you can own.</h2>
                <p>
                  Before perps, SOLARD shipped as a local-first Solana terminal:
                  new-token streams, supply intelligence, screening, and
                  simulation-first execution. That stack still matters — it is
                  how you find what to trade and verify structure before you
                  size a position.
                </p>
              </div>
              <div className="v4-intelligence-grid">
                <div className="v4-intel-copy">
                  <article>
                    <span>01</span>
                    <div>
                      <h3>Live new-token stream</h3>
                      <p>
                        Watch Pump / PumpSwap creation events and DEX profile
                        arrivals over a server-streamed feed, then jump to pair
                        metrics once a pool is indexed.
                      </p>
                    </div>
                  </article>
                  <article>
                    <span>02</span>
                    <div>
                      <h3>Supply &amp; screening</h3>
                      <p>
                        Inspect holder concentration, filters, and watchlists
                        from state you can self-host — not a black-box ranking
                        feed.
                      </p>
                    </div>
                  </article>
                  <article>
                    <span>03</span>
                    <div>
                      <h3>Self-hosted, 0% app fee</h3>
                      <p>
                        Run the open-source stack on your machine. Same
                        philosophy as the perps UI: you control the path from
                        signal to signed transaction.
                      </p>
                    </div>
                  </article>
                  <div className="v4-actions compact">
                    <a className="v4-button secondary" href="/terminal">
                      Open Terminal →
                    </a>
                    <a className="v4-text-link" href="/docs#quickstart">
                      Self-host quickstart →
                    </a>
                  </div>
                </div>
                <div
                  className="v4-fee-panel"
                  aria-label="Open-source advantages"
                >
                  <div className="v4-window-head">
                    <div>
                      <i /> why the terminal still matters
                    </div>
                    <span>open source</span>
                  </div>
                  <ul className="v4-check-list">
                    <li>Screen launches before you open a perp</li>
                    <li>Local simulation and explicit live gates</li>
                    <li>Your RPC, your indexer, your SQLite</li>
                    <li>Composable filters → watchlists → strategies</li>
                    <li>Same zero application-fee ethos as trading</li>
                  </ul>
                  <p
                    style={{ marginTop: 16, fontSize: 12.5, color: "#8f8f8f" }}
                  >
                    Use the terminal to discover and research. Use{" "}
                    <a href="/trade" style={{ color: "#1fd35f" }}>
                      /trade
                    </a>{" "}
                    when you are ready to open an on-chain position.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="v4-closing">
            <div className="wrap rv">
              <div className="v4-closing-panel">
                <div>
                  <span className="v4-kicker">start trading</span>
                  <h2>Connect a wallet. Pick a memecoin. Go long or short.</h2>
                  <p>
                    Fully on-chain SOLARD perps — collateral, positions, and
                    liquidations on Solana. The open-source terminal remains
                    available for discovery and self-hosted workflows.
                  </p>
                </div>
                <div className="v4-actions">
                  <a className="v4-button primary" href="/trade">
                    Trade Perps →
                  </a>
                  <a className="v4-button secondary" href="/terminal">
                    Open Terminal
                  </a>
                  <a
                    className="v4-button social"
                    href="https://github.com/7flash/solard"
                    target="_blank"
                    rel="noreferrer"
                  >
                    GitHub ↗
                  </a>
                </div>
              </div>
            </div>
          </section>
        </main>

        <footer className="v4-footer">
          <div className="wrap">
            <div className="v4-footer-main">
              <div className="v4-footer-brand">
                <div>
                  <Mark size={16} className="mark grn" />
                  <b>SOLARD</b>
                </div>
                <p>
                  On-chain memecoin perps and open-source Solana trading
                  infrastructure.
                </p>
              </div>
              <div className="v4-footer-links">
                <a href="/trade">Trade</a>
                <a href="/terminal">Terminal</a>
                <a href="#perps">Perps</a>
                <a href="#onchain">On-chain</a>
                <a href="/docs">Documentation</a>
                <a
                  href="https://github.com/7flash/solard"
                  target="_blank"
                  rel="noreferrer"
                >
                  GitHub
                </a>
                <a
                  className="v4-footer-x"
                  href="https://x.com/solardxyz"
                  target="_blank"
                  rel="noreferrer"
                >
                  X · @solardxyz ↗
                </a>
              </div>
            </div>
            <div className="v4-footer-tech">
              SOLARD perps · PumpSwap marks · position PDAs · vault settlement ·
              TradJS · open source
            </div>
            <div className="v4-footer-trust">
              Fully on-chain · Solana mainnet · 0% SOLARD application trading
              fee · not financial advice
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
