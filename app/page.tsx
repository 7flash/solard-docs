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
  <ul className="v3-check-list">
    {items.map((item) => <li key={item}>{item}</li>)}
  </ul>
);

export default function HomePage() {
  const install = [
    "git clone https://github.com/7flash/solard",
    "cd solard",
    "bun install",
    "cp .env.example .env",
    "",
    "# terminal 1 — index market data",
    "bun run indexer/main.ts",
    "",
    "# terminal 2 — serve the TradJS terminal",
    "export BUN_PORT=3000",
    "bunx tradjs server",
  ].join("\n");

  return (
    <>
      <Head>
        <title>SOLARD — local-first Solana execution infrastructure</title>
        <meta
          name="description"
          content="SOLARD is an open-source, local-first execution stack for Pump, PumpSwap, and Solana-native workflows. Discover markets, manage wallets, simulate transactions, automate strategies, and submit through RPC, Helius, or Jito."
        />
        <meta property="og:title" content="SOLARD — Solana trading infrastructure that runs on your machine" />
        <meta
          property="og:description"
          content="Open-source, self-hosted Solana execution infrastructure with a TradJS terminal, Sowl CLI, TypeScript SDK, local SQLite state, and no SOLARD application trading fee."
        />
      </Head>

      <div className="landing-v3">
        <header className="v3-header">
          <div className="wrap">
            <nav className="v3-nav" aria-label="Primary navigation">
              <a className="v3-brand" href="#top" aria-label="SOLARD home">
                <Mark />
                <span>SOLARD</span>
              </a>
              <div className="v3-nav-links">
                <a href="#execution" data-s="execution">Execution</a>
                <a href="#architecture" data-s="architecture">Architecture</a>
                <a href="#developers" data-s="developers">Developers</a>
                <a href="/docs">Docs</a>
                <a href="https://github.com/7flash/solard" target="_blank" rel="noreferrer">GitHub</a>
                <a className="v3-nav-cta" href="/docs">View Docs →</a>
              </div>
            </nav>
          </div>
        </header>

        <main id="top">
          <section className="v3-hero">
            <div className="wrap">
              <div className="v3-hero-grid">
                <div className="v3-hero-copy rv">
                  <div className="v3-eyebrow">open source · self-hosted · solana mainnet</div>
                  <h1>Solana trading infrastructure that runs on your machine.</h1>
                  <p className="v3-lede">
                    SOLARD is an open-source execution terminal for Pump, PumpSwap, and Solana-native workflows.
                  </p>
                  <p>
                    Manage wallets, inspect markets, preview transactions, automate strategies, and submit through RPC, Helius, or Jito—all from one local stack.
                  </p>
                  <div className="v3-actions">
                    <a className="v3-button primary" href="/docs">View Documentation</a>
                    <a className="v3-button secondary" href="https://github.com/7flash/solard" target="_blank" rel="noreferrer">GitHub ↗</a>
                  </div>
                  <div className="v3-trust-line"><i>●</i> Local-first. Open source. No application trading fee.</div>
                </div>

                <div className="v3-command cmd rv" aria-label="SOLARD install commands">
                  <div className="v3-command-head"><span>quickstart.sh</span><span>local</span></div>
                  <div className="ln"><span className="p">$</span><span className="c">git clone https://github.com/7flash/solard</span></div>
                  <div className="ln"><span className="p">$</span><span className="c">cd solard && bun install</span></div>
                  <div className="ln"><span className="p">$</span><span className="c">cp .env.example .env</span></div>
                  <div className="ln note"><span className="p">#</span><span className="c">terminal 1 — index market data</span></div>
                  <div className="ln"><span className="p">$</span><span className="c">bun run indexer/main.ts</span></div>
                  <div className="ln note"><span className="p">#</span><span className="c">terminal 2 — serve the UI</span></div>
                  <div className="ln"><span className="p">$</span><span className="c">export BUN_PORT=3000</span></div>
                  <div className="ln"><span className="p">$</span><span className="c">bunx tradjs server</span></div>
                  <button data-copy={install}>copy</button>
                  <div className="v3-command-foot"><span>two long-running processes</span><span>simulation first</span></div>
                </div>
              </div>
            </div>
          </section>

          <section className="v3-summary v3-section">
            <div className="wrap rv">
              <div className="v3-summary-grid">
                <div className="v3-section-heading">
                  <span className="v3-kicker">product summary</span>
                  <h2>One stack from market signal to signed transaction.</h2>
                </div>
                <div className="v3-summary-copy">
                  <p>SOLARD connects market data, local wallet state, venue routing, transaction construction, simulation, and submission.</p>
                  <p>The browser terminal, CLI, SDK, scripts, and background workers all operate on the same execution engine and shared local database.</p>
                  <div className="v3-negatives">
                    <span>No hosted trading account.</span>
                    <span>No separate automation platform.</span>
                    <span>No black-box transaction builder.</span>
                  </div>
                  <p className="v3-emphasis">Your strategies and keys remain under your control.</p>
                </div>
              </div>
            </div>
          </section>

          <section className="v3-section v3-core" id="core">
            <div className="wrap rv">
              <div className="v3-section-heading centered">
                <span className="v3-kicker">core value</span>
                <h2>Your machine is the execution stack.</h2>
                <p>SOLARD keeps the important parts of trading infrastructure close to the operator.</p>
              </div>
              <div className="v3-feature-grid">
                {[
                  ["01", "Local wallet control", "Import and organize wallets without handing execution authority to a hosted trading platform."],
                  ["02", "Local transaction construction", "Instructions are built and signed locally before they are submitted to the network."],
                  ["03", "Shared state", "Wallets, groups, tokens, prices, executions, jobs, and watchlists live in one SQLite database."],
                  ["04", "Explicit live gate", "Simulation and planning are the default. Live execution must be deliberately enabled."],
                  ["05", "Flexible submission", "Route transactions through standard RPC, Helius Sender, or Jito according to the operation."],
                  ["06", "Zero SOLARD application fee", "SOLARD does not add a percentage fee to trades. Network, venue, priority, RPC, and optional sender costs still apply."],
                ].map(([n, title, body]) => (
                  <article className="v3-feature-card" key={n}>
                    <span>{n}</span><h3>{title}</h3><p>{body}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="v3-section v3-execution" id="execution">
            <div className="wrap rv">
              <div className="v3-section-heading split">
                <div><span className="v3-kicker">execution</span><h2>Build locally. Inspect first. Submit deliberately.</h2></div>
                <p>SOLARD resolves the market, constructs the required instructions, estimates execution parameters, and presents the transaction before it is sent.</p>
              </div>
              <div className="v3-step-list">
                {[
                  ["01", "Resolve the venue", "One routing layer handles Pump bonding curves and PumpSwap pools."],
                  ["02", "Build the transaction", "Accounts, instructions, token programs, slippage limits, compute budgets, and signers are assembled locally."],
                  ["03", "Simulate", "Inspect expected behavior before opening the live execution gate."],
                  ["04", "Choose the sender", "Submit through RPC, Helius, or Jito based on speed, privacy, ordering, and bundle requirements."],
                  ["05", "Record the result", "Execution status and market activity are written back into local state for later review."],
                ].map(([n, title, body]) => (
                  <article className="v3-step" key={n}>
                    <span>{n}</span><div><h3>{title}</h3><p>{body}</p></div>
                  </article>
                ))}
              </div>
              <a className="v3-text-link" href="/docs#venues">Explore Execution Details →</a>
            </div>
          </section>

          <section className="v3-section v3-interfaces" id="developers">
            <div className="wrap rv">
              <div className="v3-section-heading centered">
                <span className="v3-kicker">operator interfaces</span>
                <h2>One engine. Three ways to operate it.</h2>
              </div>
              <div className="v3-interface-stack">
                <article className="v3-interface-card">
                  <div className="v3-interface-copy">
                    <span className="v3-number">01</span><h3>TradJS Terminal</h3>
                    <p>Use the browser interface for monitoring and operational control.</p>
                    <CheckList items={["Market monitoring", "Wallet and group management", "Portfolio visibility", "Trade previews", "Launch workflows", "Execution history", "Worker and process status"]} />
                    <a className="v3-text-link" href="/docs#web">Read Console Guide →</a>
                  </div>
                  <div className="v3-route-box"><span>routes</span><code>/terminal</code><code>/portfolio</code><code>/trade</code><code>/launch</code></div>
                </article>

                <article className="v3-interface-card">
                  <div className="v3-interface-copy">
                    <span className="v3-number">02</span><h3>Sowl CLI</h3>
                    <p>Use the command line for repeatable operations and shell automation.</p>
                    <p>The CLI exposes wallet, token, quote, trade, transfer, launch, metadata, worker, watch, and script workflows.</p>
                    <a className="v3-text-link" href="/docs#cli">Read Command Reference →</a>
                  </div>
                  <div className="v3-code-card">
                    <pre><span>$</span> sowl wallet list{`\n`}<span>$</span> sowl token add &lt;mint&gt;{`\n`}<span>$</span> sowl quote &lt;mint&gt; --sol 0.1{`\n`}<span>$</span> sowl buy &lt;mint&gt; --wallet &lt;wallet&gt; \{`\n   `}--sol 0.1 --simulate-only{`\n`}<span>$</span> sowl run &lt;script&gt; --group &lt;group&gt;</pre>
                  </div>
                </article>

                <article className="v3-interface-card">
                  <div className="v3-interface-copy">
                    <span className="v3-number">03</span><h3>TypeScript SDK</h3>
                    <p>Build strategies directly on the same modules used by the terminal and CLI.</p>
                    <p>Use the SDK for agents, execution services, custom dashboards, launch tools, and automated strategies.</p>
                    <a className="v3-text-link" href="/docs#scripts">Read SDK Guide →</a>
                  </div>
                  <div className="v3-code-card ts">
                    <pre><span>const</span> quote = <span>await</span> sowl.quote({`{`}{`\n  `}token: mint,{`\n  `}wallet,{`\n  `}side: <b>"buy"</b>,{`\n  `}amountSol: 0.1,{`\n`}{`}`});{`\n\n`}<span>const</span> plan = <span>await</span> sowl.buildTrade(quote);{`\n`}<span>const</span> simulation = <span>await</span> sowl.simulatePlan(plan);</pre>
                  </div>
                </article>
              </div>
            </div>
          </section>

          <section className="v3-section v3-architecture" id="architecture">
            <div className="wrap rv">
              <div className="v3-section-heading split">
                <div><span className="v3-kicker">architecture</span><h2>Streams in. Signed transactions out.</h2></div>
                <p>SOLARD separates data collection, local state, transaction logic, and submission into clear components.</p>
              </div>
              <div className="v3-architecture-flow">
                {[
                  ["Discover", ["Helius logs", "Market adapters", "DEX enrichment", "Curve snapshots", "Pump + PumpSwap activity", "User watchlists"]],
                  ["Normalize", ["Token metadata", "Market state", "Price + liquidity", "Wallet balances", "Execution records", "Process health"]],
                  ["Operate", ["TradJS terminal", "Sowl CLI", "TypeScript SDK", "Scripts + agents", "Launch workflows"]],
                  ["Execute", ["Solana RPC", "Helius Sender", "Direct Jito", "Atomic ordered bundles"]],
                ].map(([title, items], index) => (
                  <article className="v3-architecture-stage" key={title as string}>
                    <div className="v3-stage-head"><span>0{index + 1}</span><h3>{title as string}</h3></div>
                    <ul>{(items as string[]).map((item) => <li key={item}>{item}</li>)}</ul>
                  </article>
                ))}
              </div>
              <p className="v3-architecture-note">All interfaces share the same venue registry, transaction builders, sender adapters, and SQLite-backed state.</p>
              <a className="v3-text-link" href="/docs#how">View System Architecture →</a>
            </div>
          </section>

          <section className="v3-section v3-lifecycle">
            <div className="wrap rv">
              <div className="v3-lifecycle-grid">
                <div>
                  <span className="v3-kicker">pump + pumpswap</span>
                  <h2>One execution surface across the token lifecycle.</h2>
                  <p>A token may begin on a Pump bonding curve and later move into a PumpSwap pool.</p>
                  <p>SOLARD handles both through one venue-resolution layer.</p>
                  <p>Strategies do not need separate command structures for every market phase. The resolver identifies the active venue and selects the appropriate account layout and instruction builder.</p>
                </div>
                <div className="v3-lifecycle-panel">
                  <div className="v3-lifecycle-path"><span>Pump curve</span><i>→</i><span>PumpSwap pool</span></div>
                  <h3>Supported workflows</h3>
                  <CheckList items={["Market inspection", "Buy and sell quoting", "Slippage-controlled execution", "Token launches", "Ordered launch bundles", "Creator-fee workflows", "Transfers and wallet operations", "Automated strategy scripts"]} />
                </div>
              </div>
            </div>
          </section>

          <section className="v3-section v3-programmable">
            <div className="wrap rv">
              <div className="v3-section-heading split">
                <div><span className="v3-kicker">programmable automation</span><h2>Keep strategy logic in plain TypeScript.</h2></div>
                <p>Register a script once, then run it through the same wallet, group, venue, simulation, and sender controls used everywhere else.</p>
              </div>
              <div className="v3-code-grid">
                <div className="v3-code-card large">
                  <div className="v3-code-label">strategy registry</div>
                  <pre><span>import</span> {`{ defineSolardConfig }`} <span>from</span> <b>"soler/runner"</b>;{`\n\n`}<span>export default</span> defineSolardConfig({`{`}{`\n  `}scripts: {`{`}{`\n    `}snipe: <b>"./scripts/snipe.ts"</b>,{`\n    `}rebalance: <b>"./scripts/rebalance.ts"</b>,{`\n    `}<b>"claim-trade-send"</b>: <b>"./scripts/claim-trade-send.ts"</b>,{`\n  `}{`}`},{`\n`}{`}`});</pre>
                </div>
                <div className="v3-code-card large">
                  <div className="v3-code-label">terminal</div>
                  <pre><span>$</span> sowl run snipe \{`\n   `}--group snipers \{`\n   `}--sender jito</pre>
                  <h3>Strategies can use</h3>
                  <CheckList items={["Managed wallet groups", "Local market state", "Venue-aware quotes", "Transaction simulation", "RPC, Helius, or Jito submission", "Execution history", "Worker-generated data", "Custom risk controls"]} />
                </div>
              </div>
            </div>
          </section>

          <section className="v3-section v3-safety">
            <div className="wrap rv">
              <div className="v3-safety-grid">
                <div>
                  <span className="v3-kicker">safety</span>
                  <h2>Simulation first. Live execution by explicit choice.</h2>
                  <p>SOLARD is built for operators who want visibility into what their software is doing.</p>
                  <p>By default, workflows can be developed and reviewed without live submission.</p>
                  <div className="v3-env-line"><code>SOLARD_ENABLE_LIVE_TRADES=0</code></div>
                  <a className="v3-text-link" href="/docs#safety">Read Safety Guide →</a>
                </div>
                <div className="v3-safety-checks">
                  <h3>Before enabling live trading, verify</h3>
                  <CheckList items={["Wallet selection", "Position sizing", "SOL reserves", "Slippage limits", "Compute settings", "Priority fees", "Sender configuration", "Bundle tips", "RPC reliability", "Token and market addresses"]} />
                  <p>Set the live gate only after the complete path has been reviewed.</p>
                </div>
              </div>
            </div>
          </section>

          <section className="v3-section v3-open-source">
            <div className="wrap rv">
              <div className="v3-open-source-panel">
                <div>
                  <span className="v3-kicker">open source</span>
                  <h2>Inspect every layer.</h2>
                  <p>SOLARD is designed to be read, modified, and self-hosted.</p>
                  <p>The transaction builders, market adapters, workers, database layer, CLI, and terminal are available in the repository.</p>
                  <p>Use the complete application or integrate only the pieces your system needs.</p>
                </div>
                <a className="v3-button secondary" href="https://github.com/7flash/solard" target="_blank" rel="noreferrer">View on GitHub ↗</a>
              </div>
            </div>
          </section>

          <section className="v3-section v3-quickstart" id="quickstart">
            <div className="wrap rv">
              <div className="v3-quickstart-grid">
                <div>
                  <span className="v3-kicker">quickstart</span>
                  <h2>Run SOLARD locally.</h2>
                  <p>The actual terminal uses two long-running processes: the indexer writes market state, then the TradJS server exposes the interface. Run them in separate shells from the repository root.</p>
                  <div className="v3-actions compact">
                    <a className="v3-text-link" href="/docs#quickstart">Read Quickstart →</a>
                    <a className="v3-text-link" href="/docs#env">Open Configuration Guide →</a>
                  </div>
                </div>
                <div className="v3-command cmd">
                  <div className="v3-command-head"><span>full terminal</span><span>2 processes</span></div>
                  <div className="ln"><span className="p">$</span><span className="c">git clone https://github.com/7flash/solard</span></div>
                  <div className="ln"><span className="p">$</span><span className="c">cd solard && bun install</span></div>
                  <div className="ln"><span className="p">$</span><span className="c">cp .env.example .env</span></div>
                  <div className="ln note"><span className="p">#</span><span className="c">terminal 1</span></div>
                  <div className="ln"><span className="p">$</span><span className="c">bun run indexer/main.ts</span></div>
                  <div className="ln note"><span className="p">#</span><span className="c">terminal 2</span></div>
                  <div className="ln"><span className="p">$</span><span className="c">export BUN_PORT=3000</span></div>
                  <div className="ln"><span className="p">$</span><span className="c">bunx tradjs server</span></div>
                  <button data-copy={install}>copy</button>
                  <div className="v3-command-foot"><span>indexer first</span><span>TradJS second</span></div>
                </div>
              </div>
            </div>
          </section>

          <section className="v3-closing">
            <div className="wrap rv">
              <div className="v3-closing-panel">
                <div>
                  <span className="v3-kicker">run your own stack</span>
                  <h2>Own the full path from signal to execution.</h2>
                  <p>Run the terminal locally. Automate through the CLI. Build strategies with the SDK. Submit through the infrastructure you choose.</p>
                </div>
                <div className="v3-actions">
                  <a className="v3-button primary" href="/docs">Read the Docs</a>
                  <a className="v3-button secondary" href="https://github.com/7flash/solard" target="_blank" rel="noreferrer">GitHub ↗</a>
                </div>
              </div>
            </div>
          </section>
        </main>

        <footer className="v3-footer">
          <div className="wrap">
            <div className="v3-footer-main">
              <div className="v3-footer-brand"><div><Mark size={16} className="mark grn" /><b>SOLARD</b></div><p>Open-source, local-first Solana execution infrastructure.</p></div>
              <div className="v3-footer-links">
                <a href="#execution">Execution</a><a href="#architecture">Architecture</a><a href="#developers">Developers</a><a href="/docs">Documentation</a><a href="https://github.com/7flash/solard">GitHub</a>
              </div>
            </div>
            <div className="v3-footer-tech">Pump discovery · Pump bonding curves · PumpSwap markets · RPC · Helius · Jito · TradJS · SQLite</div>
            <div className="v3-footer-trust">Self-hosted · Solana mainnet · No SOLARD application trading fee</div>
          </div>
        </footer>
      </div>
    </>
  );
}
