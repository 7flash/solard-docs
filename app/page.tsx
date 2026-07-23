import { Head } from "tradjs/web";

export const ssg = true;

const Mark = ({ size = 18 }: { size?: number }) => (
  <svg
    className="mark"
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

export default function HomePage() {
  return (
    <>
      <Head>
        <title>SOLARD — trade every Solana token up to 25×</title>
        <meta
          name="description"
          content="Long or short any Solana token with up to 25× leverage. New tokens stream in live and are immediately available from /trade."
        />
        <meta
          property="og:title"
          content="SOLARD — trade every Solana token up to 25×"
        />
        <meta
          property="og:description"
          content="Every migrated Pump token. Long or short. Up to 25× leverage. Fully on-chain on Solana."
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
                <a href="#markets">Markets</a>
                <a href="#protocol">Protocol</a>
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
                >
                  X · @solardxyz ↗
                </a>
                <a className="v4-nav-cta" href="/trade">
                  Trade →
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
                    fully on-chain · migrated PumpSwap pairs · up to 25×
                  </div>
                  <h1>
                    Long or short
                    <br />
                    anything.
                  </h1>
                  <p className="v4-lede">
                    Trade Pump tokens after their canonical PumpSwap migration
                    is indexed. Choose an amount in SOL, set leverage up to 25×,
                    and open a long or short directly from your wallet.
                  </p>
                  <div className="v4-actions">
                    <a className="v4-button primary" href="/trade">
                      Trade now →
                    </a>
                  </div>
                </div>
                <div
                  className="v4-intel-window"
                  aria-label="SOLARD trade preview"
                >
                  <div className="v4-window-head">
                    <div>
                      <i /> LIVE MARKETS
                    </div>
                    <span>newest first</span>
                  </div>
                  <div className="v4-intel-stats">
                    <div>
                      <span>token</span>
                      <b>SOLARD</b>
                    </div>
                    <div>
                      <span>side</span>
                      <b className="grn">LONG</b>
                    </div>
                    <div>
                      <span>amount</span>
                      <b>1.00 SOL</b>
                    </div>
                    <div>
                      <span>leverage</span>
                      <b>10×</b>
                    </div>
                  </div>
                  <div
                    className="v4-supply-chart"
                    style={{ padding: "22px 16px" }}
                  >
                    <div style={{ display: "grid", gap: 12 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <span>liquidation distance</span>
                        <b>9.2%</b>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <span>market health</span>
                        <b className="grn">100</b>
                      </div>
                      <a
                        className="v4-button primary"
                        href="/trade"
                        style={{ textAlign: "center" }}
                      >
                        OPEN TRADE →
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
          <section className="v4-section" id="markets">
            <div className="wrap rv">
              <div className="v4-heading">
                <span className="v4-kicker">live markets</span>
                <h2>Newly migrated PumpSwap pairs arrive continuously.</h2>
                <p>
                  The market list stays sorted by age. Fresh tokens animate into
                  the top, the newest 30 rotate automatically, and anything you
                  pin stays visible.
                </p>
              </div>
              <div className="v4-feature-grid">
                <article className="v4-feature-card featured">
                  <span>01</span>
                  <h3>Migrated pools only</h3>
                  <p>
                    The SQD indexer admits only canonical Pump migrations into
                    WSOL pools.
                  </p>
                </article>
                <article className="v4-feature-card">
                  <span>02</span>
                  <h3>Up to 25×</h3>
                  <p>
                    Pick leverage and see liquidation price and distance before
                    signing.
                  </p>
                </article>
                <article className="v4-feature-card">
                  <span>03</span>
                  <h3>Health score</h3>
                  <p>
                    A clear 1–100 signal based on cached on-chain liquidity and
                    pool state.
                  </p>
                </article>
              </div>
            </div>
          </section>
          <section className="v4-section" id="protocol">
            <div className="wrap rv">
              <div className="v4-heading">
                <span className="v4-kicker">on-chain</span>
                <h2>Wallet-signed. Publicly verifiable.</h2>
                <p>
                  Positions and trades include direct Solscan links. Switch
                  between all activity and only yours without losing the full
                  market view.
                </p>
              </div>
              <div className="v4-actions">
                <a className="v4-button primary" href="/trade">
                  Trade →
                </a>
              </div>
            </div>
          </section>
        </main>
        <footer className="v4-footer">
          <div className="wrap">
            <div className="v4-footer-brand">
              <Mark />
              <span>SOLARD</span>
            </div>
            <div>
              <a href="/trade">Trade</a>
              <a href="/docs">Docs</a>
              <a href="https://github.com/7flash/solard">GitHub</a>
              <a href="https://x.com/solardxyz">X</a>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
