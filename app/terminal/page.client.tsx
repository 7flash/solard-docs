import { render } from "tradjs/client";
import type {
  DexMarket,
  DexMarketError,
  DexMarketSnapshot,
} from "../lib/market";
import { formatPercent, formatUsd, shortAddress } from "../lib/market";
import type { NewTokenItem } from "../lib/new-token";
import type { ClientTokenStreamState } from "../lib/token-stream-client";
import { subscribeTokenStream } from "../lib/token-stream-client";

type View = "stream" | "markets";
type MarketMode = "momentum" | "volume" | "liquidity";

let view: View = "stream";
let marketMode: MarketMode = "momentum";
let indexedOnly = false;
let tokenState: ClientTokenStreamState = {
  status: {
    state: "idle",
    source: null,
    label: "new-token stream",
    message: "Connecting",
    connectedAt: null,
    retryAt: null,
  },
  tokens: [],
  transport: "idle",
};
let selectedMint: string | null = null;
let marketSnapshot: DexMarketSnapshot | null = null;
let marketError: string | null = null;
let marketLoading = false;
let disposed = false;
let marketTimer = 0;
let streamClock = 0;

function ageLabel(time: number | null | undefined) {
  if (!time) return "unknown";
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

function sourceSemantics() {
  return tokenState.status.source === "pumpportal"
    ? "Pump/PumpSwap creation events"
    : tokenState.status.source === "solana-rpc"
      ? "confirmed Pump create transactions"
      : tokenState.status.source === "dexscreener-profile"
        ? "new DEX Screener profiles—not every mint"
        : "source selection pending";
}

async function copyText(value: string, button?: HTMLButtonElement) {
  try {
    await navigator.clipboard.writeText(value);
    if (button) button.textContent = "copied";
  } catch {
    if (button) button.textContent = "copy failed";
  }
  if (button)
    window.setTimeout(() => {
      button.textContent = "copy mint";
    }, 1_100);
}

function Controls({
  update,
  refreshMarkets,
}: {
  update: () => void;
  refreshMarkets: () => void;
}) {
  return (
    <>
      <button
        className={`term-btn ${view === "stream" ? "active" : ""}`}
        onClick={() => {
          view = "stream";
          update();
        }}
      >
        new tokens
      </button>
      <button
        className={`term-btn ${view === "markets" ? "active" : ""}`}
        onClick={() => {
          view = "markets";
          update();
          requestAnimationFrame(drawChart);
        }}
      >
        pair metrics
      </button>
      {view === "stream" ? (
        <button
          className={`term-btn ${indexedOnly ? "active" : ""}`}
          onClick={() => {
            indexedOnly = !indexedOnly;
            update();
          }}
        >
          {indexedOnly ? "indexed only" : "show all"}
        </button>
      ) : (
        <>
          <button
            className={`term-btn ${marketMode === "momentum" ? "active" : ""}`}
            onClick={() => {
              marketMode = "momentum";
              update();
            }}
          >
            24h change
          </button>
          <button
            className={`term-btn ${marketMode === "volume" ? "active" : ""}`}
            onClick={() => {
              marketMode = "volume";
              update();
            }}
          >
            volume
          </button>
          <button
            className={`term-btn ${marketMode === "liquidity" ? "active" : ""}`}
            onClick={() => {
              marketMode = "liquidity";
              update();
            }}
          >
            liquidity
          </button>
          <button
            className="term-btn refresh"
            disabled={marketLoading}
            onClick={refreshMarkets}
          >
            {marketLoading ? "refreshing…" : "refresh"}
          </button>
        </>
      )}
    </>
  );
}

function TokenRow({
  token,
  selected,
  select,
}: {
  token: NewTokenItem;
  selected: boolean;
  select: () => void;
}) {
  const market = token.dex;
  return (
    <button
      className={`new-token-row ${selected ? "selected" : ""}`}
      onClick={select}
    >
      <span className="token-cell">
        {token.imageUrl ? (
          <img src={token.imageUrl} alt="" loading="lazy" />
        ) : (
          <i>{token.symbol.slice(0, 1)}</i>
        )}
        <span>
          <b>${token.symbol}</b>
          <small>{token.name}</small>
        </span>
      </span>
      <span className="stream-age">
        <b>{ageLabel(token.createdAt ?? token.observedAt)}</b>
        <small>
          {token.source === "dexscreener-profile" ? "observed" : "created"}
        </small>
      </span>
      <span className={`stream-index ${market ? "up" : "pending"}`}>
        <b>{market ? formatUsd(market.priceUsd) : "pending"}</b>
        <small>
          {market
            ? `${market.windows.m5.buys + market.windows.m5.sells} tx / 5m`
            : "DEX index"}
        </small>
      </span>
    </button>
  );
}

function TokenDetails({ token }: { token: NewTokenItem | null }) {
  if (!token)
    return (
      <div className="token-detail-empty">
        <b>Waiting for the first token</b>
        <span>
          The server keeps the selected source active and fans arrivals out over
          SSE automatically.
        </span>
      </div>
    );
  const market = token.dex;
  return (
    <div className="token-detail">
      <div className="token-detail-head">
        <div className="token-identity">
          {token.imageUrl ? (
            <img src={token.imageUrl} alt="" />
          ) : (
            <i>{token.symbol.slice(0, 1)}</i>
          )}
          <div>
            <span>{token.name}</span>
            <h2>${token.symbol}</h2>
          </div>
        </div>
        <span className={`index-badge ${market ? "indexed" : "waiting"}`}>
          {market ? "DEX indexed" : "pair pending"}
        </span>
      </div>
      <div className="mint-box">
        <code>{token.mint}</code>
        <button
          onClick={(event: Event) =>
            void copyText(token.mint, event.currentTarget as HTMLButtonElement)
          }
        >
          copy mint
        </button>
      </div>
      <div className="detail-grid">
        <div>
          <span>source</span>
          <b>
            {token.source === "pumpportal"
              ? "PumpPortal creation"
              : token.source === "solana-rpc"
                ? "Solana Pump logs"
                : "DEX profile"}
          </b>
        </div>
        <div>
          <span>{token.createdAt ? "created" : "observed"}</span>
          <b>{ageLabel(token.createdAt ?? token.observedAt)} ago</b>
        </div>
        <div>
          <span>initial buy</span>
          <b>
            {token.initialBuySol == null
              ? "—"
              : `${token.initialBuySol.toFixed(4)} SOL`}
          </b>
        </div>
        <div>
          <span>market cap</span>
          <b>
            {market
              ? formatUsd(market.marketCap ?? market.fdv)
              : token.marketCapSol == null
                ? "—"
                : `${token.marketCapSol.toFixed(1)} SOL`}
          </b>
        </div>
        <div>
          <span>price</span>
          <b>{market ? formatUsd(market.priceUsd) : "waiting"}</b>
        </div>
        <div>
          <span>liquidity</span>
          <b>{market ? formatUsd(market.liquidityUsd) : "waiting"}</b>
        </div>
        <div>
          <span>5m volume</span>
          <b>{market ? formatUsd(market.windows.m5.volume) : "—"}</b>
        </div>
        <div>
          <span>5m change</span>
          <b
            className={
              market && market.windows.m5.change >= 0
                ? "grn"
                : market
                  ? "red"
                  : ""
            }
          >
            {market ? formatPercent(market.windows.m5.change) : "—"}
          </b>
        </div>
      </div>
      {token.description ? (
        <p className="token-description">{token.description}</p>
      ) : null}
      <div className="token-links">
        <a
          href={`https://solscan.io/token/${token.mint}`}
          target="_blank"
          rel="noreferrer"
        >
          Solscan ↗
        </a>
        <a
          href={`https://pump.fun/coin/${token.mint}`}
          target="_blank"
          rel="noreferrer"
        >
          pump.fun ↗
        </a>
        {market ? (
          <a href={market.url} target="_blank" rel="noreferrer">
            DEX Screener ↗
          </a>
        ) : null}
        {token.signature ? (
          <a
            href={`https://solscan.io/tx/${token.signature}`}
            target="_blank"
            rel="noreferrer"
          >
            creation tx ↗
          </a>
        ) : null}
      </div>
      <div className="enrichment-note">
        {market
          ? `Best indexed pair: ${market.dexId} / ${market.quoteToken.symbol}.`
          : "DEX Screener enrichment retries with bounded backoff. Some tokens never create an indexed pool."}
      </div>
    </div>
  );
}

function StreamDashboard({ update }: { update: () => void }) {
  const tokens = indexedOnly
    ? tokenState.tokens.filter((token) => token.dex)
    : tokenState.tokens;
  const selected =
    tokenState.tokens.find((token) => token.mint === selectedMint) ??
    tokenState.tokens[0] ??
    null;
  const indexed = tokenState.tokens.filter((token) => token.dex).length;
  return (
    <div className="stream-dashboard">
      <div className="stream-status-bar">
        <span>
          <i
            className={tokenState.transport === "open" ? "online" : "retrying"}
          >
            ●
          </i>{" "}
          {tokenState.status.label}
        </span>
        <span>
          {tokenState.transport} · {sourceSemantics()}
        </span>
        <span>
          {tokenState.tokens.length} buffered · latest{" "}
          {ageLabel(tokenState.tokens[0]?.observedAt)} · {indexed} indexed
        </span>
      </div>
      <div className="stream-terminal-grid">
        <section className="panel new-token-list-panel">
          <div className="panel-head">
            <span>
              {indexedOnly ? "DEX-indexed arrivals" : "latest arrivals"}
            </span>
            <span>{tokens.length} visible</span>
          </div>
          <div className="new-token-list">
            {tokens.length ? (
              tokens.slice(0, 40).map((token) => (
                <TokenRow
                  token={token}
                  selected={selected?.mint === token.mint}
                  select={() => {
                    selectedMint = token.mint;
                    update();
                  }}
                />
              ))
            ) : (
              <div className="stream-wait">
                <b>Stream connected</b>
                <span>Waiting for the next upstream event.</span>
              </div>
            )}
          </div>
        </section>
        <section className="panel token-detail-panel">
          <div className="panel-head">
            <span>token inspector</span>
            <span>{selected ? shortAddress(selected.mint) : "—"}</span>
          </div>
          <TokenDetails token={selected} />
        </section>
      </div>
    </div>
  );
}

function MarketRow({ market }: { market: DexMarket }) {
  const change = market.windows.h24.change;
  return (
    <a
      className="market-row live-market-row"
      href={market.url}
      target="_blank"
      rel="noreferrer"
    >
      <span className="token-cell">
        {market.imageUrl ? (
          <img src={market.imageUrl} alt="" loading="lazy" />
        ) : (
          <i>{market.baseToken.symbol.slice(0, 1)}</i>
        )}
        <span>
          <b>${market.baseToken.symbol}</b>
          <small>
            {market.dexId} · /{market.quoteToken.symbol}
          </small>
        </span>
      </span>
      <span className="price-cell">
        <b>{formatUsd(market.priceUsd)}</b>
        <small>MC {formatUsd(market.marketCap ?? market.fdv)}</small>
      </span>
      <span className={`move ${change >= 0 ? "up" : "dn"}`}>
        <b>{formatPercent(change)}</b>
        <small>24h</small>
      </span>
    </a>
  );
}

function SnapshotLines({ markets }: { markets: DexMarket[] }) {
  return (
    <div className="console-log snapshot-log">
      {markets.slice(0, 9).map((market) => (
        <a className="entry" href={market.url} target="_blank" rel="noreferrer">
          <span className="time">
            {market.windows.h24.buys + market.windows.h24.sells} txns
          </span>
          <span className={market.windows.h24.change >= 0 ? "grn" : "red"}>
            ◆ ${market.baseToken.symbol}
          </span>
          <span>
            vol {formatUsd(market.windows.h24.volume)} · liq{" "}
            {formatUsd(market.liquidityUsd)} ·{" "}
            {shortAddress(market.pairAddress)}
          </span>
        </a>
      ))}
    </div>
  );
}

function MarketDashboard() {
  if (marketLoading && !marketSnapshot)
    return (
      <div className="terminal-loading">
        <b>Connecting to DEX Screener</b>
        <span>Fetching Solana pair snapshots through `/api/dexscreener`…</span>
      </div>
    );
  if (marketError && !marketSnapshot)
    return (
      <div className="terminal-loading error">
        <b>Market data unavailable</b>
        <span>{marketError}</span>
      </div>
    );
  const markets = marketSnapshot?.markets ?? [];
  const updated = marketSnapshot
    ? new Date(marketSnapshot.fetchedAt).toLocaleTimeString("en-GB", {
        hour12: false,
      })
    : "—";
  return (
    <div className="terminal-grid live-terminal-grid">
      <div className="panel chart-panel">
        <div className="panel-head">
          <span>
            {marketMode === "momentum"
              ? "24h price change"
              : marketMode === "volume"
                ? "24h volume"
                : "USD liquidity"}
          </span>
          <span className={marketSnapshot?.stale ? "warn-text" : "grn"}>
            {marketSnapshot?.stale ? "● stale cache" : "● live snapshot"}
          </span>
        </div>
        <div className="chart-shell live-chart-shell">
          <canvas id="terminal-canvas" />
        </div>
        <div className="chart-legend">
          <span>source: {marketSnapshot?.source}</span>
          <span>updated: {updated}</span>
          <span>{markets.length} pairs</span>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head">
          <span>market watch</span>
          <span>{markets.length} Solana pairs</span>
        </div>
        <div className="market-list live-market-list">
          {markets.slice(0, 8).map((market) => (
            <MarketRow market={market} />
          ))}
        </div>
        <div className="panel-head">
          <span>aggregate windows</span>
          <span>
            {marketError
              ? `last refresh failed: ${marketError}`
              : "DEX Screener"}
          </span>
        </div>
        <SnapshotLines markets={markets} />
      </div>
    </div>
  );
}

function metricFor(market: DexMarket) {
  if (marketMode === "volume") return market.windows.h24.volume;
  if (marketMode === "liquidity") return market.liquidityUsd;
  return market.windows.h24.change;
}

function drawChart() {
  if (view !== "markets") return;
  const canvas = document.getElementById(
    "terminal-canvas",
  ) as HTMLCanvasElement | null;
  const shell = canvas?.parentElement;
  const context = canvas?.getContext("2d");
  const markets = marketSnapshot?.markets.slice(0, 8) ?? [];
  if (!canvas || !shell || !context || !markets.length) return;
  const rect = shell.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);
  context.font = "11px IBM Plex Mono, monospace";
  context.textBaseline = "middle";
  const left = 78,
    right = 74,
    top = 24,
    bottom = 20,
    chartWidth = Math.max(40, rect.width - left - right),
    rowHeight = (rect.height - top - bottom) / markets.length;
  const values = markets.map(metricFor),
    maxAbsolute = Math.max(1, ...values.map((value) => Math.abs(value))),
    maxValue = Math.max(1, ...values),
    center = left + chartWidth / 2;
  for (let grid = 0; grid <= 4; grid += 1) {
    const x = left + chartWidth * (grid / 4);
    context.strokeStyle = "#151515";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x + 0.5, top);
    context.lineTo(x + 0.5, rect.height - bottom);
    context.stroke();
  }
  if (marketMode === "momentum") {
    context.strokeStyle = "#3a3a3a";
    context.beginPath();
    context.moveTo(center + 0.5, top);
    context.lineTo(center + 0.5, rect.height - bottom);
    context.stroke();
  }
  markets.forEach((market, index) => {
    const value = values[index],
      y = top + index * rowHeight + rowHeight / 2,
      barHeight = Math.max(8, Math.min(18, rowHeight * 0.46));
    context.fillStyle = "#bdbdbd";
    context.textAlign = "right";
    context.fillText(`$${market.baseToken.symbol.slice(0, 9)}`, left - 10, y);
    if (marketMode === "momentum") {
      const width = (Math.abs(value) / maxAbsolute) * (chartWidth / 2);
      context.fillStyle = value >= 0 ? "#1fd35f" : "#e05555";
      context.fillRect(
        value >= 0 ? center : center - width,
        y - barHeight / 2,
        Math.max(1, width),
        barHeight,
      );
    } else {
      const width = (value / maxValue) * chartWidth;
      context.fillStyle = index === 0 ? "#1fd35f" : "#4f7cf7";
      context.globalAlpha = Math.max(0.32, 1 - index * 0.07);
      context.fillRect(left, y - barHeight / 2, Math.max(1, width), barHeight);
      context.globalAlpha = 1;
    }
    context.fillStyle = "#8f8f8f";
    context.textAlign = "left";
    context.fillText(
      marketMode === "momentum" ? formatPercent(value) : formatUsd(value),
      rect.width - right + 10,
      y,
    );
  });
}

async function loadMarkets(update: () => void, manual = false) {
  marketLoading = true;
  update();
  try {
    const response = await fetch(
      `/api/dexscreener?limit=12${manual ? `&t=${Date.now()}` : ""}`,
      { headers: { Accept: "application/json" }, cache: "no-store" },
    );
    const payload = (await response.json()) as
      DexMarketSnapshot | DexMarketError;
    if (!response.ok || !payload.ok)
      throw new Error(payload.ok ? `HTTP ${response.status}` : payload.error);
    marketSnapshot = payload;
    marketError = null;
  } catch (cause) {
    marketError =
      cause instanceof Error ? cause.message : "Market data unavailable";
  } finally {
    marketLoading = false;
    if (!disposed) update();
  }
}

declare global {
  interface Window {
    __solardTerminalCleanup__?: () => void;
  }
}

export default function mount() {
  window.__solardTerminalCleanup__?.();

  const dashboard = document.getElementById("terminal-dashboard");
  const controls = document.getElementById("terminal-controls");
  if (!dashboard || !controls) return;
  disposed = false;
  const update = () => {
    render(
      <Controls
        update={update}
        refreshMarkets={() => void loadMarkets(update, true)}
      />,
      controls,
    );
    render(
      view === "stream" ? (
        <StreamDashboard update={update} />
      ) : (
        <MarketDashboard />
      ),
      dashboard,
    );
    if (view === "markets") requestAnimationFrame(drawChart);
  };
  const unsubscribe = subscribeTokenStream((next) => {
    tokenState = next;
    if (!selectedMint && next.tokens[0]) selectedMint = next.tokens[0].mint;
    if (!disposed) update();
  });
  const pollMarkets = async () => {
    await loadMarkets(update);
    if (!disposed)
      marketTimer = window.setTimeout(
        pollMarkets,
        Math.max(30_000, marketSnapshot?.refreshAfterMs ?? 30_000),
      );
  };
  const resize = () => drawChart();
  update();
  void pollMarkets();
  streamClock = window.setInterval(() => {
    if (!disposed && view === "stream") update();
  }, 5_000);
  window.addEventListener("resize", resize);
  let active = true;

  const cleanup = () => {
    if (!active) return;
    active = false;
    disposed = true;
    unsubscribe();
    window.clearTimeout(marketTimer);
    window.clearInterval(streamClock);
    window.removeEventListener("resize", resize);
    render(null, controls);
    render(null, dashboard);
    if (window.__solardTerminalCleanup__ === cleanup)
      delete window.__solardTerminalCleanup__;
  };

  window.__solardTerminalCleanup__ = cleanup;
  return cleanup;
}
