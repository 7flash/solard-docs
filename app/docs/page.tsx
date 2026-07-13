export const ssg = true;

const command = `git clone https://github.com/7flash/solard
cd solard && bun install
cp .env.example .env
bun bin/solard.ts start --open`;

export default function DocsPage() {
  return (
    <main className="subpage">
      <div className="wrap">
        <a className="back" href="/">← back to landing</a>
        <div className="tag">documentation map</div>
        <h1>SOLARD DOCS</h1>
        <p className="lede">A compact companion route for the rebuilt landing. The repository remains the source of truth for the full command and environment reference.</p>
        <div className="subpage-grid">
          <nav className="subnav">
            <a href="#quickstart">quickstart</a>
            <a href="#cli">cli</a>
            <a href="#web">web console</a>
            <a href="#venues">venues</a>
            <a href="#launch">launch</a>
            <a href="#scripts">scripts</a>
            <a href="#agents">agents</a>
            <a href="#env">environment</a>
          </nav>
          <div className="doc-body">
            <section id="quickstart"><h2>Quickstart</h2><p>Install Bun, clone the repository, install packages, copy the environment template, then boot the local console.</p><pre>{command}</pre></section>
            <section id="cli"><h2>CLI reference</h2><p>Use <code>solard help</code> for the live command surface. Wallet import, groups, direct buys and sells, simulations, launch flows, ALTs, and external scripts are designed to be composable.</p></section>
            <section id="web"><h2>Web console</h2><p>The local console reads the same SQLite state as the CLI and workers. Live spending remains gated by <code>SOLARD_ENABLE_LIVE_TRADES</code>.</p></section>
            <section id="venues"><h2>Venues &amp; routing</h2><p>Routes target the Pump.fun bonding curve or PumpSwap AMM directly, then submit through your selected RPC, Helius Sender, or Jito path.</p></section>
            <section id="launch"><h2>Token launch</h2><p>Use <code>solard launch pump</code> for metadata upload, mint preparation, optional buyer groups, and explicit live submission modes.</p></section>
            <section id="scripts"><h2>Scripts &amp; workflows</h2><p>Register plain TypeScript strategy files in <code>solard.config.ts</code>, then execute them with <code>solard run</code> and the same wallet, group, sender, and simulation controls.</p></section>
            <section id="agents"><h2>AI agents</h2><p>Integrate through the typed SDK, CLI tool calls, or the guarded local HTTP API. Keep simulation and live-trade gates explicit in every agent workflow.</p></section>
            <section id="env"><h2>Environment</h2><p>Start from <a href="https://github.com/7flash/solard/blob/master/.env.example"><code>.env.example</code></a>, configure your RPC and sender credentials, and leave live trading disabled until simulation output is verified.</p></section>
          </div>
        </div>
      </div>
    </main>
  );
}
