import { render } from "tradjs/client";

type Market = { symbol: string; cap: number; move: number };
const symbols = ["GOAT", "WIF", "PNUT", "FWOG", "GIGA", "MOODENG"];
let mode: "holders" | "flow" = "holders";
let markets: Market[] = symbols.map((symbol, index) => ({ symbol, cap: 42 + index * 37, move: (index % 2 ? -1 : 1) * (1.2 + index * 0.7) }));
let logs: string[] = [];

function Controls({ update }: { update: () => void }) {
  return <>
    <button className={`term-btn ${mode === "holders" ? "active" : ""}`} onClick={() => { mode = "holders"; update(); }}>holders</button>
    <button className={`term-btn ${mode === "flow" ? "active" : ""}`} onClick={() => { mode = "flow"; update(); }}>trade flow</button>
  </>;
}

function Dashboard() {
  return <div className="terminal-grid">
    <div className="panel">
      <div className="panel-head"><span>{mode === "holders" ? "holder concentration" : "net venue flow"}</span><span>sample · local</span></div>
      <div className="chart-shell"><canvas id="terminal-canvas" /></div>
    </div>
    <div className="panel">
      <div className="panel-head"><span>market watch</span><span>6 tokens</span></div>
      <div className="market-list">{markets.map((market) => <div className="market-row"><span className="sym">${market.symbol}</span><span className="mc">${market.cap.toFixed(0)}k</span><span className={`move ${market.move >= 0 ? "up" : "dn"}`}>{market.move >= 0 ? "+" : ""}{market.move.toFixed(1)}%</span></div>)}</div>
      <div className="panel-head"><span>stream</span><span className="grn">● live</span></div>
      <div className="console-log">{logs.map((line) => <div className="entry" dangerouslySetInnerHTML={{ __html: line }} />)}</div>
    </div>
  </div>;
}

function drawChart() {
  const canvas = document.getElementById("terminal-canvas") as HTMLCanvasElement | null;
  const shell = canvas?.parentElement;
  const context = canvas?.getContext("2d");
  if (!canvas || !shell || !context) return;
  const rect = shell.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);
  for (let grid = 1; grid < 5; grid += 1) { const y = rect.height * grid / 5; context.strokeStyle = "#111"; context.beginPath(); context.moveTo(0, y); context.lineTo(rect.width, y); context.stroke(); }
  const lines = mode === "holders" ? 28 : 8;
  for (let line = 0; line < lines; line += 1) {
    context.strokeStyle = line < 3 ? "#1fd35f" : `hsl(${(line * 53) % 360} 55% 48%)`;
    context.globalAlpha = line < 3 ? 0.9 : 0.36;
    context.lineWidth = line < 3 ? 1.4 : 1;
    context.beginPath();
    let value = mode === "holders" ? 0.1 + Math.random() * 0.8 : rect.height / 2;
    for (let point = 0; point < 80; point += 1) {
      const x = point / 79 * rect.width;
      value = mode === "holders" ? Math.max(0.02, Math.min(0.95, value + (Math.random() - 0.48) * 0.04)) : Math.max(20, Math.min(rect.height - 20, value + (Math.random() - 0.5) * 26));
      const y = mode === "holders" ? rect.height * (1 - value) : value;
      point ? context.lineTo(x, y) : context.moveTo(x, y);
    }
    context.stroke();
  }
  context.globalAlpha = 1;
}

export default function mount() {
  const dashboard = document.getElementById("terminal-dashboard");
  const controls = document.getElementById("terminal-controls");
  if (!dashboard || !controls) return;
  const update = () => { render(<Controls update={update} />, controls); render(<Dashboard />, dashboard); requestAnimationFrame(drawChart); };
  const tick = () => {
    markets = markets.map((market) => ({ ...market, cap: Math.max(4, market.cap + (Math.random() - 0.48) * 7), move: Math.max(-15, Math.min(15, market.move + (Math.random() - 0.5) * 1.3)) }));
    const token = symbols[(Math.random() * symbols.length) | 0];
    const side = Math.random() > 0.42 ? "<span class=\"grn\">▲ buy</span>" : "<span style=\"color:var(--red)\">▼ sell</span>";
    logs = [`<span class=\"time\">${new Date().toLocaleTimeString("en-GB", { hour12: false })}</span> ${side} ${(Math.random() * 2.4 + 0.05).toFixed(2)} SOL $${token}`, ...logs].slice(0, 9);
    update();
  };
  update();
  const timer = window.setInterval(tick, 1500);
  const resize = () => drawChart();
  window.addEventListener("resize", resize);
  return () => { window.clearInterval(timer); window.removeEventListener("resize", resize); render(null, controls); render(null, dashboard); };
}
