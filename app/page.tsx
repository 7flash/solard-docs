import { Head } from "tradjs/web";

export const ssg = true;

export default function HomePage() {
  return (
    <>
      <Head>
        <title>SOLARD — trading terminal</title>
        <meta
          name="description"
          content="Local-first Solana trading terminal and multi-wallet CLI/SDK. Direct venue transactions, no Jupiter, no platform fees."
        />
        <meta property="og:title" content="SOLARD — trading terminal" />
        <meta
          property="og:description"
          content="Runs on your machine. Your keys, your RPC, direct venue transactions, 0% platform fees."
        />
      </Head>
      <div>
        <header>
          <div className="wrap">
            <nav>
              <a className="brand" href="#">
                <svg
                  className="mark"
                  width={18}
                  height={18}
                  viewBox="0 0 32 32"
                  aria-hidden="true"
                >
                  <path d="M10.5 4h16l-3.4 5h-16z" />
                  <path d="M7.1 13.5h16l3.4 5h-16z" />
                  <path d="M10.5 23h16l-3.4 5h-16z" />
                </svg>
                <span className="wm">SOLARD</span>
              </a>
              <div className="nav-links">
                <a href="#fees" data-s="fees">
                  fees
                </a>
                <a href="#features" data-s="features">
                  features
                </a>
                <a href="#terminal" data-s="terminal">
                  terminal
                </a>
                <a className="docs" href="/docs">
                  docs
                </a>
                <a className="gh" href="https://github.com/7flash/solard">
                  github
                </a>
                <a className="act" href="#get">
                  run →
                </a>
              </div>
            </nav>
          </div>
        </header>
        {/* live ticker */}
        <div className="ticker" aria-hidden="true">
          <div className="rail" id="ticker-root" />
        </div>
        <main>
          {/* HERO */}
          <section className="hero">
            <div className="wrap">
              <div className="hero-grid">
                <div>
                  <div className="tag">
                    open source · runs locally · solana mainnet
                  </div>
                  <div className="lockup">
                    <svg
                      className="mark"
                      width={58}
                      height={58}
                      viewBox="0 0 32 32"
                      aria-hidden="true"
                    >
                      <path d="M10.5 4h16l-3.4 5h-16z" />
                      <path d="M7.1 13.5h16l3.4 5h-16z" />
                      <path d="M10.5 23h16l-3.4 5h-16z" />
                    </svg>
                    <h1 id="wordmark" data-text="SOLARD">
                      SOLARD
                    </h1>
                  </div>
                  <div className="sub">
                    Trading Terminal <span className="cursor">_</span>
                  </div>
                  <p>
                    A local-first Solana terminal and multi-wallet CLI/SDK for
                    memecoin traders and AI agents. Direct venue transactions —
                    pump.fun curve and PumpSwap AMM instructions built by hand,
                    no Jupiter, no middleman clipping your fills. Keys live
                    encrypted in a local SQLite database, and every line that
                    touches them is on GitHub. You pay network fees and tips.{" "}
                    <b>Nothing else, to no one.</b>
                  </p>
                  <div className="cmd">
                    <div className="ln">
                      <span className="p">$</span>
                      <span className="c">
                        git clone https://github.com/7flash/solard
                      </span>
                    </div>
                    <div className="ln">
                      <span className="p">$</span>
                      <span className="c">
                        cd solard &amp;&amp; bun install
                      </span>
                    </div>
                    <div className="ln">
                      <span className="p">$</span>
                      <span className="c">bun bin/solard.ts start --open</span>
                    </div>
                    <button data-copy="git clone https://github.com/7flash/solard && cd solard && bun install && bun bin/solard.ts start --open">
                      copy
                    </button>
                  </div>
                  <div className="alt">
                    or drive it headless: <a href="/docs#cli">solard help</a> ·{" "}
                    <a href="/docs">read the docs</a>
                  </div>
                </div>
                <div className="boot" aria-hidden="true">
                  <div className="tbar">
                    <span className="dot" />
                    <span className="dot" />
                    <span className="dot" />
                    <span>solard start</span>
                    <span className="live">live</span>
                  </div>
                  <pre id="boot" />
                </div>
              </div>
            </div>
          </section>
          {/* META */}
          <div className="wrap rv">
            <div className="meta">
              <div className="cell">
                <div className="v">0%</div>
                <div className="k">platform fee, forever</div>
              </div>
              <div className="cell">
                <div className="v">DRY-RUN</div>
                <div className="k">live trades gated by default</div>
              </div>
              <div className="cell">
                <div className="v">SQLITE</div>
                <div className="k">encrypted local persistence</div>
              </div>
              <div className="cell">
                <div className="v">LOCAL</div>
                <div className="k">your RPC, your keys</div>
              </div>
            </div>
          </div>
          {/* FEES */}
          <section className="blk" id="fees">
            <span className="idx">01</span>
            <div className="wrap rv">
              <div className="tag">fees</div>
              <h2>The middleman, removed.</h2>
              <div className="fee-hero">
                <span className="zero">0%</span>
                <span className="vs">
                  hosted bots clip <b>~1% of every trade</b>. solard assembles
                  transactions locally and submits through your own RPC, Helius
                  Sender, or Jito. network fees and tips are the entire cost.
                </span>
              </div>
              <div className="fees">
                <div className="col us">
                  <div className="who">solard · local</div>
                  <ul>
                    <li>keys never leave your machine</li>
                    <li>your own RPC endpoint + rate limits</li>
                    <li>every line auditable on GitHub</li>
                    <li>no account, no server, no custody</li>
                  </ul>
                </div>
                <div className="col them">
                  <div className="who">hosted terminals · ~1%</div>
                  <ul>
                    <li>$1,000 per $100k of volume</li>
                    <li>keys or approvals on their servers</li>
                    <li>shared infra + rate limits</li>
                    <li>closed source</li>
                  </ul>
                </div>
              </div>
              <div className="calc" id="fee-calculator-root">
                <label for="vol">your monthly volume</label>
                <input
                  type="range"
                  id="vol"
                  min={10}
                  max={1000}
                  step={10}
                  value={100}
                />
                <div className="out">
                  at <b>$100k</b>/mo, a 1% bot costs <b>$12,000</b>/yr ·{" "}
                  <span className="grn">solard: $0</span>
                </div>
              </div>
            </div>
          </section>
          <div className="marq" aria-hidden="true">
            <div className="rail">
              <span>
                zero platform fees <i>◆</i> your keys, your RPC <i>◆</i> direct
                venue transactions <i>◆</i> no jupiter <i>◆</i> dry-run by
                default <i>◆</i>
              </span>
              <span>
                zero platform fees <i>◆</i> your keys, your RPC <i>◆</i> direct
                venue transactions <i>◆</i> no jupiter <i>◆</i> dry-run by
                default <i>◆</i>
              </span>
            </div>
          </div>
          {/* FEATURES */}
          <section className="blk" id="features">
            <span className="idx">02</span>
            <div className="wrap rv">
              <div className="tag">capabilities</div>
              <h2>One terminal, the whole pipeline.</h2>
              <div className="rows feature-rows">
                <a className="row" href="/docs#venues">
                  <span className="n">01</span>
                  <span className="h">direct venue execution</span>
                  <span className="d">
                    Pump.fun bonding curve and PumpSwap AMM instructions
                    constructed manually with a route resolver between them.
                    Send via <code>rpc</code>, <code>helius</code> Sender fast
                    lane, or <code>jito</code> — with{" "}
                    <code>--simulate-only</code> on every trade.
                  </span>
                  <span className="ar">→</span>
                </a>
                <a className="row" href="/docs#cli">
                  <span className="n">02</span>
                  <span className="h">multi-wallet groups</span>
                  <span className="d">
                    Import wallets encrypted at rest under{" "}
                    <code>SOLARD_MASTER_KEY</code>, organize them into weighted
                    groups, then{" "}
                    <code>solard buy --group snipers --sender jito</code>{" "}
                    submits the whole group as Jito bundles, five transactions
                    per bundle.
                  </span>
                  <span className="ar">→</span>
                </a>
                <a className="row" href="/docs#web">
                  <span className="n">03</span>
                  <span className="h">live pump terminal</span>
                  <span className="d">
                    A web console over a supervised worker fleet: Helius logs +
                    LaserStream and PumpPortal streams, bonding-curve snapshots,
                    holder snapshots, SMA indicators, a reconciler, and a live
                    doctor that tells you which feed is lying.
                  </span>
                  <span className="ar">→</span>
                </a>
                <a className="row" href="/docs#launch">
                  <span className="n">04</span>
                  <span className="h">token launching</span>
                  <span className="d">
                    <code>solard launch pump</code> — metadata via pump frontend
                    or Pinata, vanity mint grinding, coordinated buyer groups,
                    ALT prep, and submit modes from{" "}
                    <code>after-deploy-processed</code> to{" "}
                    <code>fast-spam</code>.
                  </span>
                  <span className="ar">→</span>
                </a>
                <a className="row" href="/docs#scripts">
                  <span className="n">05</span>
                  <span className="h">scripts &amp; workflows</span>
                  <span className="d">
                    Strategies stay outside the kernel: register plain
                    TypeScript in <code>solard.config.ts</code> and{" "}
                    <code>solard run</code> it. Venue-agnostic workflows ship in
                    the box — snipe, claim→trade→send, wait-launch-trade-group.
                  </span>
                  <span className="ar">→</span>
                </a>
                <a className="row" href="/docs#agents">
                  <span className="n">06</span>
                  <span className="h">built for agents</span>
                  <span className="d">
                    Three integration surfaces for AI agents: the typed SDK from
                    any Bun process, the CLI as tool calls, and a local HTTP API
                    guarded by a web token. Agent registry, watchlists,
                    creator-fee claiming.
                  </span>
                  <span className="ar">→</span>
                </a>
              </div>
              <div className="safety">
                <span className="flag">SOLARD_ENABLE_LIVE_TRADES=0</span>
                <p>
                  Safe by default. Live buy, sell, and launch routes reject{" "}
                  <b>live=true</b> until you explicitly flip the gate — the
                  console can't spend real SOL because you clicked the wrong
                  button at 4am.
                </p>
              </div>
            </div>
          </section>
          {/* TERMINAL */}
          <section className="blk rule" id="terminal">
            <span className="idx">03</span>
            <div className="wrap rv">
              <div className="tag">terminal</div>
              <h2>Streams in, SQLite in the middle, everything reads local.</h2>
              <p>
                Independent stream workers write normalized events into one
                local database. The console, the CLI, and your scripts all read
                the same tables — no worker talks to another, and if one dies,
                bgrun's staleness detection and the reconciler know before you
                do. Every hop is traced with measure-fn.
              </p>
              <div className="arch">
                <div className="stage">
                  <div className="st">streams</div>
                  <div className="it">
                    <i>●</i>helius-logs
                  </div>
                  <div className="it">
                    <i>●</i>helius-laserstream
                  </div>
                  <div className="it">
                    <i>●</i>pumpportal-live
                  </div>
                  <div className="it">
                    <i>●</i>curve-snapshots
                  </div>
                  <div className="it">
                    <i>●</i>holder-snapshots
                  </div>
                </div>
                <div className="flow">──▶</div>
                <div className="stage core">
                  <div className="st">solard.db</div>
                  <div className="it">tokens · trades · holders</div>
                  <div className="it">indicators · signals</div>
                  <div className="it">wallets (encrypted)</div>
                  <div className="it">reconciler · doctor</div>
                </div>
                <div className="flow">──▶</div>
                <div className="stage">
                  <div className="st">surfaces</div>
                  <div className="it">web console</div>
                  <div className="it">solard CLI</div>
                  <div className="it">SDK · scripts · agents</div>
                  <div className="it">telegram signals</div>
                </div>
              </div>
              <p className="arch-sub">
                plus <code>metadata-repair</code> with a circuit breaker, and a{" "}
                <code>live doctor</code> endpoint that probes every feed and
                reports which one is stale.
              </p>
              <div className="dist">
                <div className="lead">holder distribution over time</div>
                <p>
                  The holder-snapshot worker samples largest accounts
                  continuously; the terminal draws every holder as one line.
                  Vertical is share of supply, horizontal is time. Whales
                  flatten near the cap, accumulators climb, distributors bleed
                  out, fresh wallets appear mid-chart. Concentration is visible
                  before it moves the price.
                </p>
                <div className="mini">
                  <canvas id="mini" />
                  <div className="tip" id="tip" />
                </div>
                <div className="hint">
                  hover to isolate a wallet · sample data
                </div>
                <a className="launch" href="/terminal">
                  launch the distribution terminal →
                </a>
              </div>
            </div>
          </section>
          <div className="marq" aria-hidden="true">
            <div className="rail">
              <span>
                pump.fun curve <i>◆</i> pumpswap amm <i>◆</i> jito bundles{" "}
                <i>◆</i> helius sender <i>◆</i> vanity mints <i>◆</i> holder
                snapshots <i>◆</i>
              </span>
              <span>
                pump.fun curve <i>◆</i> pumpswap amm <i>◆</i> jito bundles{" "}
                <i>◆</i> helius sender <i>◆</i> vanity mints <i>◆</i> holder
                snapshots <i>◆</i>
              </span>
            </div>
          </div>
          {/* SCRIPTS */}
          <section className="blk" id="scripts">
            <span className="idx">04</span>
            <div className="wrap rv">
              <div className="tag">programmable</div>
              <h2>Your edge, as plain TypeScript.</h2>
              <p>
                No DSL, no sandbox, no approval process. Scripts import the SDK;
                the kernel never imports scripts. Register them once, then run
                them with wallet, group, and sender flags — simulate first, go
                live when the numbers agree.
              </p>
              <div className="code">
                <div className="bar">
                  <span>solard.config.ts</span>
                  <span style={{ color: "#a06bff" }}>ts</span>
                </div>
                <pre>
                  <span className="c-k">import</span> {"{"} defineSolardConfig{" "}
                  {"}"} <span className="c-k">from</span>{" "}
                  <span className="c-s">"solard/runner"</span>;{"\n"}
                  {"\n"}
                  <span className="c-k">export default</span>{" "}
                  <span className="c-f">defineSolardConfig</span>({"{"}
                  {"\n"}
                  {"  "}scripts: {"{"}
                  {"\n"}
                  {"    "}snipe:{" "}
                  <span className="c-s">"./scripts/snipe.ts"</span>,{"\n"}
                  {"    "}
                  <span className="c-s">"claim-trade-send"</span>: {"{"}
                  {"\n"}
                  {"      "}path:{" "}
                  <span className="c-s">"./scripts/claim-trade-send.ts"</span>,
                  {"\n"}
                  {"      "}description:{" "}
                  <span className="c-s">
                    "claim creator fees → buy → deliver"
                  </span>
                  ,{"\n"}
                  {"    "}
                  {"}"},{"\n"}
                  {"  "}
                  {"}"},{"\n"}
                  {"}"});
                </pre>
              </div>
              <div className="code">
                <div className="bar">
                  <span>terminal session</span>
                  <span style={{ color: "var(--faint)" }}>sh</span>
                </div>
                <pre>
                  <span className="c-c">$</span> solard import{" "}
                  <span className="c-s">&lt;private_key&gt;</span> dev{"\n"}
                  <span className="c-c">$</span> solard group create snipers
                  &amp;&amp; solard group add-many snipers w1,w2,w3{"\n"}
                  <span className="c-c">$</span> solard buy{" "}
                  <span className="c-s">&lt;token_ca&gt;</span> --group snipers
                  --sol <span className="c-n">0.5</span> --sender jito
                  --simulate-only{"\n"}
                  <span className="c-c">$</span> solard run snipe --name{" "}
                  <span className="c-s">"EXACT NAME"</span> --group snipers
                  --sol <span className="c-n">0.05</span> --sender jito{"\n"}
                  <span className="c-c">$</span> solard launch pump --creator
                  dev --image ./logo.png --description{" "}
                  <span className="c-s">"..."</span> {"\\"}
                  {"\n"}
                  {"    "}--buyer-group snipers --submit-mode
                  spam-after-market-ready --live
                </pre>
              </div>
            </div>
          </section>
          {/* DOCS */}
          <section className="blk rule" id="docsec">
            <span className="idx">05</span>
            <div className="wrap rv">
              <div className="tag">documentation</div>
              <h2>Everything is documented.</h2>
              <div className="docgrid">
                <a href="/docs#quickstart">
                  <span className="dh">Quickstart</span>
                  <span className="dd">
                    Clone, configure your RPC, boot the console, make your first
                    simulated trade.
                  </span>
                  <span className="dl">read →</span>
                </a>
                <a href="/docs#cli">
                  <span className="dh">CLI reference</span>
                  <span className="dd">
                    Wallets, groups, trading, prices, launching, watching, ALTs,
                    scripts — the full command surface.
                  </span>
                  <span className="dl">read →</span>
                </a>
                <a href="/docs#web">
                  <span className="dh">Web console</span>
                  <span className="dd">
                    Terminal, trade, portfolio, wallets, watchlists, launch,
                    signals — and how auth and the live gate work.
                  </span>
                  <span className="dl">read →</span>
                </a>
                <a href="/docs#venues">
                  <span className="dh">Venues &amp; routing</span>
                  <span className="dd">
                    Pump.fun curve vs PumpSwap AMM, how the route resolver
                    picks, quotes, slippage, senders.
                  </span>
                  <span className="dl">read →</span>
                </a>
                <a href="/docs#agents">
                  <span className="dh">AI agents</span>
                  <span className="dd">
                    Give an agent the SDK, the CLI, or the local HTTP API — with
                    the safety gate still in charge.
                  </span>
                  <span className="dl">read →</span>
                </a>
                <a href="/docs#env">
                  <span className="dh">Environment</span>
                  <span className="dd">
                    Every variable that changes solard's behavior, from RPC
                    endpoints to circuit breakers.
                  </span>
                  <span className="dl">read →</span>
                </a>
              </div>
            </div>
          </section>
          {/* GET */}
          <section className="blk rule" id="get">
            <span className="idx">06</span>
            <div className="wrap rv">
              <div className="tag">get started</div>
              <h2>Three commands to run it.</h2>
              <p>
                Bun, your Helius RPC key, your machine. Every line of what
                executes your trades is on GitHub.
              </p>
              <div className="cmd get-cmd">
                <div className="ln">
                  <span className="p">$</span>
                  <span className="c">
                    git clone https://github.com/7flash/solard
                  </span>
                </div>
                <div className="ln">
                  <span className="p">$</span>
                  <span className="c">cd solard &amp;&amp; bun install</span>
                </div>
                <div className="ln">
                  <span className="p">$</span>
                  <span className="c">bun bin/solard.ts start --open</span>
                </div>
                <button data-copy="git clone https://github.com/7flash/solard && cd solard && bun install && bun bin/solard.ts start --open">
                  copy
                </button>
              </div>
              <div
                className="alt"
                style={{ color: "var(--faint)", fontSize: "12.5px" }}
              >
                <a
                  href="https://github.com/7flash/solard"
                  style={{
                    color: "var(--dim)",
                    textDecoration: "none",
                    borderBottom: "1px solid var(--line2)",
                  }}
                >
                  github
                </a>{" "}
                ·{" "}
                <a
                  href="/docs"
                  style={{
                    color: "var(--dim)",
                    textDecoration: "none",
                    borderBottom: "1px solid var(--line2)",
                  }}
                >
                  documentation
                </a>{" "}
                ·{" "}
                <a
                  href="https://github.com/7flash/solard/blob/master/.env.example"
                  style={{
                    color: "var(--dim)",
                    textDecoration: "none",
                    borderBottom: "1px solid var(--line2)",
                  }}
                >
                  .env.example
                </a>
              </div>
            </div>
          </section>
        </main>
        <footer>
          <div className="wrap foot">
            <div className="fbrand">
              <svg
                className="mark grn"
                width={14}
                height={14}
                viewBox="0 0 32 32"
                aria-hidden="true"
              >
                <path d="M10.5 4h16l-3.4 5h-16z" />
                <path d="M7.1 13.5h16l3.4 5h-16z" />
                <path d="M10.5 23h16l-3.4 5h-16z" />
              </svg>
              <span className="wm">SOLARD</span>
            </div>
            <div className="links">
              <a href="https://github.com/7flash/solard">github</a>
              <a href="/docs">docs</a>
            </div>
            <div className="fine">
              open source · self-hosted · not financial advice
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
