import { Head } from "tradjs/web";

export const ssg = true;

const Mark = ({ size = 18, className = "mark" }: { size?: number; className?: string }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <path d="M10.5 4h16l-3.4 5h-16z" />
    <path d="M7.1 13.5h16l3.4 5h-16z" />
    <path d="M10.5 23h16l-3.4 5h-16z" />
  </svg>
);

const CheckList = ({ items }: { items: string[] }) => (
  <ul className="v4-check-list">
    {items.map((item) => <li key={item}>{item}</li>)}
  </ul>
);

const FeatureCard = ({ number, title, children, featured = false }: {
  number: string;
  title: string;
  children: string;
  featured?: boolean;
  key?: string;
}) => (
  <article className={`v4-feature-card${featured ? " featured" : ""}`}>
    <span>{number}</span>
    <h3>{title}</h3>
    <p>{children}</p>
  </article>
);

function SupplyPreview() {
  return (
    <div className="v4-intel-window" aria-label="Illustrative supply distribution interface preview">
      <div className="v4-window-head">
        <div><i /> supply distribution</div>
        <span>indexed preview</span>
      </div>
      <div className="v4-intel-stats">
        <div><span>top holder</span><b>8.4%</b></div>
        <div><span>top 10</span><b>31.7%</b></div>
        <div><span>holders</span><b>1,842</b></div>
        <div><span>dev</span><b>1.2%</b></div>
      </div>
      <div className="v4-supply-chart">
        <svg viewBox="0 0 760 260" role="img" aria-label="Illustrative holder supply distribution over indexed activity">
          <g className="grid">
            <path d="M0 52H760M0 104H760M0 156H760M0 208H760" />
            <path d="M126 0V260M252 0V260M378 0V260M504 0V260M630 0V260" />
          </g>
          <path className="wallet wallet-1" d="M0 42 C100 45 150 49 230 53 S390 59 475 63 S620 70 760 76" />
          <path className="wallet wallet-2" d="M0 75 C92 73 170 76 248 82 S418 90 505 95 S650 98 760 104" />
          <path className="wallet wallet-3" d="M0 112 C98 118 170 116 255 123 S421 132 505 128 S649 120 760 126" />
          <path className="wallet wallet-4" d="M0 143 C110 139 180 145 260 151 S430 158 515 165 S650 169 760 174" />
          <path className="wallet wallet-5" d="M0 184 C86 181 176 188 258 183 S420 174 510 178 S650 190 760 188" />
          <path className="wallet wallet-6" d="M0 218 C95 218 168 214 255 220 S420 228 510 221 S650 214 760 219" />
          <path className="creator" d="M0 232 C145 232 250 232 368 228 S510 218 610 214 S704 210 760 211" />
          <path className="cluster" d="M0 250 C170 250 260 250 380 246 S505 235 570 221 S670 194 760 178" />
        </svg>
        <div className="v4-chart-legend"><span className="top">top wallets</span><span className="creator">creator / dev</span><span className="cluster">fresh cluster</span></div>
      </div>
      <div className="v4-filter-preview">
        <div className="v4-filter-bar">
          <span>liquidity &gt; 25 SOL</span><span>holders &gt; 150</span><span>dev &lt; 3%</span><span>age &lt; 30m</span>
        </div>
        <div className="v4-filter-result"><b>fresh-launches</b><span>18 matching markets</span><i>watchlist ready</i></div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const quickstart = [
    "git clone https://github.com/7flash/solard",
    "cd solard",
    "bun install",
    "cp .env.example .env",
    "export BUN_PORT=3000",
    "",
    "# terminal 1",
    "bun run indexer/main.ts",
    "",
    "# terminal 2",
    "bunx tradjs server",
  ].join("\n");

  return (
    <>
      <Head>
        <title>SOLARD — see the whole market, keep the whole trade</title>
        <meta
          name="description"
          content="SOLARD is an open-source, local-first Solana trading terminal with supply distribution analysis, deep market filtering, direct Pump and PumpSwap execution, and no SOLARD application trading fee."
        />
        <meta property="og:title" content="SOLARD — see the whole market, keep the whole trade" />
        <meta
          property="og:description"
          content="Screen markets with your own index, inspect supply distribution, simulate locally, and execute through RPC, Helius, or Jito without a SOLARD application fee."
        />
      </Head>

      <div className="landing-v4">
        <header className="v4-header">
          <div className="wrap">
            <nav className="v4-nav" aria-label="Primary navigation">
              <a className="v4-brand" href="#top" aria-label="SOLARD home"><Mark /><span>SOLARD</span></a>
              <div className="v4-nav-links">
                <a href="#why" data-s="why">Why SOLARD</a>
                <a href="#intelligence" data-s="intelligence">Intelligence</a>
                <a href="#execution" data-s="execution">Execution</a>
                <a href="#architecture" data-s="architecture">Architecture</a>
                <a href="#developers" data-s="developers">Developers</a>
                <a href="/docs">Docs</a>
                <a href="https://github.com/7flash/solard" target="_blank" rel="noreferrer">GitHub</a>
                <a className="v4-x-link" href="https://x.com/solardxyz" target="_blank" rel="noreferrer" aria-label="Follow SOLARD on X">X · @solardxyz ↗</a>
                <a className="v4-nav-cta" href="/terminal">Open Terminal →</a>
              </div>
            </nav>
          </div>
        </header>

        <main id="top">
          <section className="v4-hero">
            <div className="wrap">
              <div className="v4-hero-grid">
                <div className="v4-hero-copy rv">
                  <div className="v4-badge">open source · self-hosted · 0% application fee</div>
                  <h1>See the whole market.<br />Keep the whole trade.</h1>
                  <p className="v4-lede">SOLARD is an open-source Solana trading terminal that runs on your machine — with supply distribution charts, deep market filtering, and zero platform fee on execution.</p>
                  <p>Pump bonding curves and PumpSwap pools, one execution surface. Your keys, your database, your infrastructure.</p>
                  <div className="v4-actions">
                    <a className="v4-button primary" href="/terminal">Open Terminal →</a>
                    <a className="v4-button secondary" href="/docs">View Documentation</a>
                    <a className="v4-button social" href="https://x.com/solardxyz" target="_blank" rel="noreferrer">Follow @solardxyz on X ↗</a>
                  </div>
                  <div className="v4-trust-line"><i>●</i><span>Local-first. Open source. 0% SOLARD fee.</span><em>Some hosted terminals charge 0.5–1% per trade.</em></div>
                </div>
                <div className="v4-fee-panel rv">
                  <div className="v4-fee-top"><span>application fee</span><b>0%</b></div>
                  <div className="v4-fee-copy">No percentage skimmed from your execution. Network, venue, priority, RPC, and optional sender costs still apply.</div>
                  <div className="v4-fee-lines"><span>transaction path <b>local</b></span><span>keys <b>operator controlled</b></span><span>fee logic <b>open source</b></span></div>
                </div>
              </div>
            </div>
          </section>

          <section className="v4-section v4-why" id="why">
            <div className="wrap rv">
              <div className="v4-heading centered"><span className="v4-kicker">why SOLARD</span><h2>Trade with an edge, not a middleman.</h2></div>
              <div className="v4-why-grid">
                <FeatureCard number="01" title="0% application fee" featured>Hosted trading software can take 0.5–1% of every trade. SOLARD takes nothing. You pay network, venue, and optional priority or sender costs — that is it.</FeatureCard>
                <FeatureCard number="02" title="Supply distribution charts">See who holds a token before you touch it: top-holder share, creator and dev positions, fresh-wallet clusters, and how supply shifts through indexed activity.</FeatureCard>
                <FeatureCard number="03" title="Advanced market filtering">Filter local market state by liquidity, volume, holder count, curve progress, dev holdings, token age, and market phase. Save the result as a reusable watchlist.</FeatureCard>
                <FeatureCard number="04" title="Simulation-first execution">Every trade is built and simulated locally before the live gate opens. Inspect accounts, slippage bounds, and compute settings before submission.</FeatureCard>
              </div>
            </div>
          </section>

          <section className="v4-section v4-summary">
            <div className="wrap rv">
              <div className="v4-summary-grid">
                <div className="v4-heading"><span className="v4-kicker">product summary</span><h2>One stack from market signal to signed transaction.</h2></div>
                <div className="v4-summary-copy">
                  <p>SOLARD connects market discovery, supply analysis, local wallet state, venue routing, transaction construction, simulation, and submission — in one local stack.</p>
                  <p>The browser terminal, CLI, SDK, scripts, and background workers all operate on the same execution engine and shared SQLite database. The charts you screen with and the builder you execute with read the same state.</p>
                  <div className="v4-negatives"><span>No hosted trading account.</span><span>No per-trade platform fee.</span><span>No black-box transaction builder.</span><span>No rate-limited analytics API between you and the data.</span></div>
                </div>
              </div>
            </div>
          </section>

          <section className="v4-section v4-intelligence" id="intelligence">
            <div className="wrap rv">
              <div className="v4-heading split">
                <div><span className="v4-kicker">market intelligence</span><h2>Read the token before you trade it.</h2></div>
                <p>Most terminals stop at price. SOLARD is designed to expose the market structure behind it, using state collected by your own indexer.</p>
              </div>
              <div className="v4-intelligence-grid">
                <div className="v4-intel-copy">
                  <article><span>01</span><div><h3>Supply distribution</h3><p>Inspect concentration curves, top-N holder share, creator and dev positions, and wallet clusters. As indexed activity arrives, distribution can be compared across time instead of treated as one static snapshot.</p></div></article>
                  <article><span>02</span><div><h3>Screening and filters</h3><p>Query market state like a database — because it is one. Compose filters around liquidity depth, volume, holder count, curve progress, dev allocation, age, and market phase.</p></div></article>
                  <article><span>03</span><div><h3>From filter to execution</h3><p>A saved watchlist is an input, not a bookmark. Point a strategy at it and matching markets can flow through the same quote → simulate → execute pipeline.</p></div></article>
                  <div className="v4-inline-code"><pre>{`$ solard watch --filter "liquidity>25 holders>150 dev<3%"\n$ solard run snipe --watchlist fresh-launches --simulate-only`}</pre></div>
                </div>
                <SupplyPreview />
              </div>
            </div>
          </section>

          <section className="v4-section v4-core">
            <div className="wrap rv">
              <div className="v4-heading centered"><span className="v4-kicker">core value</span><h2>Your machine is the execution stack.</h2></div>
              <div className="v4-core-grid">
                {[
                  ["01", "Local wallet control", "Import and organize wallets without handing execution authority to a hosted platform."],
                  ["02", "Local transaction construction", "Instructions are built and signed on your machine before submission."],
                  ["03", "One shared database", "Wallets, tokens, prices, holder data, executions, jobs, and watchlists live in one SQLite file you own."],
                  ["04", "Explicit live gate", "Simulation is the default. Live execution is a deliberate switch, not an accident."],
                  ["05", "Flexible submission", "Route through standard RPC, Helius Sender, or Jito per operation."],
                  ["06", "0% SOLARD fee", "No percentage skimmed from your trades. The transaction path is open source and inspectable."],
                ].map(([n, title, body]) => <FeatureCard key={n} number={n} title={title}>{body}</FeatureCard>)}
              </div>
            </div>
          </section>

          <section className="v4-section v4-execution" id="execution">
            <div className="wrap rv">
              <div className="v4-heading split"><div><span className="v4-kicker">execution</span><h2>Build locally. Inspect first. Submit deliberately.</h2></div><p>SOLARD resolves the active market, builds the instruction plan, simulates it, and lets the operator choose how the signed transaction reaches the network.</p></div>
              <div className="v4-steps">
                {[
                  ["01", "Resolve the venue", "One routing layer handles Pump bonding curves and PumpSwap pools."],
                  ["02", "Build the transaction", "Accounts, instructions, token programs, slippage limits, compute budgets, and signers are assembled locally."],
                  ["03", "Simulate", "Inspect expected behavior before opening the live execution gate."],
                  ["04", "Choose the sender", "Submit through RPC, Helius, or Jito based on speed, ordering, and bundle requirements."],
                  ["05", "Record the result", "Execution status and resulting market activity return to local state for later review."],
                ].map(([n, title, body]) => <article className="v4-step" key={n}><span>{n}</span><h3>{title}</h3><p>{body}</p></article>)}
              </div>
              <a className="v4-text-link" href="/docs#venues">Explore Execution Details →</a>
            </div>
          </section>

          <section className="v4-section v4-interfaces" id="developers">
            <div className="wrap rv">
              <div className="v4-heading centered"><span className="v4-kicker">operator interfaces</span><h2>One engine. Three ways to operate it.</h2></div>
              <div className="v4-interface-stack">
                <article className="v4-interface-card">
                  <div><span className="v4-number">01</span><h3>TradJS Terminal</h3><p>Use the browser interface for supply analysis, market screening, wallet and group management, trade previews, launches, activity, and worker status.</p><a className="v4-text-link" href="/terminal">Open Terminal →</a></div>
                  <div className="v4-route-box"><span>workspace</span><code>/terminal</code><code>/portfolio</code><code>/trade</code><code>/launch</code></div>
                </article>
                <article className="v4-interface-card">
                  <div><span className="v4-number">02</span><h3>Solard CLI</h3><p>Repeatable operations for shell workflows, scripts, and automation.</p><a className="v4-text-link" href="/docs#cli">Read Command Reference →</a></div>
                  <div className="v4-code-card"><pre>{`$ solard wallet list\n$ solard token add <mint>\n$ solard quote <mint> --sol 0.1\n$ solard buy <mint> --wallet <wallet> \\\n    --sol 0.1 --simulate-only\n$ solard run <script> --group <group>`}</pre></div>
                </article>
                <article className="v4-interface-card">
                  <div><span className="v4-number">03</span><h3>TypeScript SDK</h3><p>Build strategies directly on the same modules used by the terminal and CLI.</p><a className="v4-text-link" href="/docs#scripts">Read SDK Guide →</a></div>
                  <div className="v4-code-card ts"><pre>{`const quote = await solard.quote({\n  token: mint,\n  wallet,\n  side: "buy",\n  amountSol: 0.1,\n});\n\nconst plan = await solard.buildTrade(quote);\nconst simulation = await solard.simulatePlan(plan);`}</pre></div>
                </article>
              </div>
            </div>
          </section>

          <section className="v4-section v4-architecture" id="architecture">
            <div className="wrap rv">
              <div className="v4-heading split"><div><span className="v4-kicker">architecture</span><h2>Streams in. Signed transactions out.</h2></div><p>Market workers normalize incoming activity into local state. Venue plugins turn intent into instructions. Sender adapters put signed transactions on the network.</p></div>
              <div className="v4-architecture-flow">
                {[
                  ["Discover", ["Helius logs", "Token profiles", "DEX enrichment", "Curve snapshots", "Pump + PumpSwap", "Watchlists"]],
                  ["Normalize", ["Token metadata", "Market state", "Price + liquidity", "Holder data", "Wallet balances", "Process health"]],
                  ["Operate", ["TradJS terminal", "Solard CLI", "TypeScript SDK", "Scripts + agents", "Launch workflows"]],
                  ["Execute", ["Solana RPC", "Helius Sender", "Direct Jito", "Ordered bundles"]],
                ].map(([title, items], index) => <article className="v4-stage" key={title as string}><div><span>0{index + 1}</span><h3>{title as string}</h3></div><ul>{(items as string[]).map((item) => <li key={item}>{item}</li>)}</ul></article>)}
              </div>
              <p className="v4-architecture-note">All interfaces share the same venue registry, transaction builders, sender adapters, and SQLite-backed state.</p>
            </div>
          </section>

          <section className="v4-section v4-lifecycle">
            <div className="wrap rv">
              <div className="v4-lifecycle-grid">
                <div><span className="v4-kicker">pump + pumpswap</span><h2>One execution surface across the token lifecycle.</h2><p>A token may begin on a Pump bonding curve and later move into a PumpSwap pool. SOLARD keeps the command and strategy surface consistent while the resolver selects the active venue and instruction builder.</p></div>
                <div className="v4-lifecycle-panel"><div className="v4-lifecycle-path"><span>Pump curve</span><i>→</i><span>PumpSwap pool</span></div><CheckList items={["Market inspection", "Buy and sell quoting", "Slippage-controlled execution", "Token launches", "Ordered launch bundles", "Creator-fee workflows", "Transfers and wallet operations", "Automated strategy scripts"]} /></div>
              </div>
            </div>
          </section>

          <section className="v4-section v4-programmable">
            <div className="wrap rv">
              <div className="v4-heading split"><div><span className="v4-kicker">programmable automation</span><h2>Keep strategy logic in plain TypeScript.</h2></div><p>Register a script once, then run it through the same wallet, group, venue, simulation, and sender controls used everywhere else.</p></div>
              <div className="v4-code-grid">
                <div className="v4-code-card large"><div className="v4-code-label">solard.config.ts</div><pre>{`import { defineSolardConfig } from "soler/runner";\n\nexport default defineSolardConfig({\n  scripts: {\n    snipe: "./scripts/snipe.ts",\n    rebalance: "./scripts/rebalance.ts",\n    "claim-trade-send": "./scripts/claim-trade-send.ts",\n  },\n});`}</pre></div>
                <div className="v4-code-card large"><div className="v4-code-label">terminal</div><pre>{`$ solard run snipe \\\n    --group snipers \\\n    --sender jito`}</pre><h3>Strategies can use</h3><CheckList items={["Managed wallet groups", "Local market state", "Venue-aware quotes", "Transaction simulation", "RPC, Helius, or Jito submission", "Execution history", "Worker-generated data", "Custom risk controls"]} /></div>
              </div>
            </div>
          </section>

          <section className="v4-section v4-safety">
            <div className="wrap rv">
              <div className="v4-safety-grid">
                <div><span className="v4-kicker">safety</span><h2>Simulation first. Live execution by explicit choice.</h2><p>Develop and review workflows without live submission. Open the gate only after wallet selection, sizing, slippage, compute, priority fees, sender configuration, and addresses have been checked.</p><div className="v4-env-line"><code>SOLARD_ENABLE_LIVE_TRADES=0</code></div><a className="v4-text-link" href="/docs#safety">Read Safety Guide →</a></div>
                <div className="v4-safety-checks"><h3>Review before live execution</h3><CheckList items={["Wallet selection", "Position sizing", "SOL reserves", "Slippage limits", "Compute settings", "Priority fees", "Sender configuration", "Bundle tips", "RPC reliability", "Token and market addresses"]} /></div>
              </div>
            </div>
          </section>

          <section className="v4-section v4-open-source">
            <div className="wrap rv"><div className="v4-open-source-panel"><div><span className="v4-kicker">open source</span><h2>Inspect every layer.</h2><p>The transaction builders, venue adapters, workers, database layer, CLI, and terminal are available in the repository. Use the complete application or integrate only the pieces your system needs.</p></div><div className="v4-open-source-actions"><a className="v4-button secondary" href="https://github.com/7flash/solard" target="_blank" rel="noreferrer">View on GitHub ↗</a><a className="v4-button social" href="https://x.com/solardxyz" target="_blank" rel="noreferrer">Follow @solardxyz ↗</a></div></div></div>
          </section>

          <section className="v4-section v4-quickstart" id="quickstart">
            <div className="wrap rv">
              <div className="v4-quickstart-grid">
                <div><span className="v4-kicker">quickstart</span><h2>Run SOLARD locally.</h2><p>Install the repository, start the market indexer, then serve the TradJS interface in a second shell.</p><div className="v4-actions compact"><a className="v4-text-link" href="/docs#quickstart">Read Quickstart →</a><a className="v4-text-link" href="/docs#env">Configuration →</a></div></div>
                <div className="v4-command cmd"><div className="v4-command-head"><span>local terminal</span><span>2 processes</span></div><pre>{quickstart}</pre><button data-copy={quickstart}>copy</button><div className="v4-command-foot"><span>indexer first</span><span>TradJS second</span></div></div>
              </div>
            </div>
          </section>

          <section className="v4-closing">
            <div className="wrap rv"><div className="v4-closing-panel"><div><span className="v4-kicker">run your own stack</span><h2>Own the full path from signal to execution.</h2><p>Screen the market with your own index. Read supply distribution before anyone tells you the narrative. Execute with zero SOLARD platform fee through the infrastructure you choose.</p></div><div className="v4-actions"><a className="v4-button primary" href="/terminal">Launch SOLARD →</a><a className="v4-button secondary" href="/docs">Read the Docs</a><a className="v4-button ghost" href="https://github.com/7flash/solard" target="_blank" rel="noreferrer">GitHub ↗</a><a className="v4-button social" href="https://x.com/solardxyz" target="_blank" rel="noreferrer">X · @solardxyz ↗</a></div></div></div>
          </section>
        </main>

        <footer className="v4-footer">
          <div className="wrap">
            <div className="v4-footer-main"><div className="v4-footer-brand"><div><Mark size={16} className="mark grn" /><b>SOLARD</b></div><p>Open-source, local-first Solana execution infrastructure.</p></div><div className="v4-footer-links"><a href="/terminal">Terminal</a><a href="#intelligence">Intelligence</a><a href="#execution">Execution</a><a href="#architecture">Architecture</a><a href="#developers">Developers</a><a href="/docs">Documentation</a><a href="https://github.com/7flash/solard" target="_blank" rel="noreferrer">GitHub</a><a className="v4-footer-x" href="https://x.com/solardxyz" target="_blank" rel="noreferrer">X · @solardxyz ↗</a></div></div>
            <div className="v4-footer-tech">Supply intelligence · Pump bonding curves · PumpSwap markets · RPC · Helius · Jito · TradJS · SQLite</div>
            <div className="v4-footer-trust">Self-hosted · Solana mainnet · 0% SOLARD application trading fee</div>
          </div>
        </footer>
      </div>
    </>
  );
}
