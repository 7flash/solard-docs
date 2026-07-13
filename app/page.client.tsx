import { render } from "tradjs/client";

const NAMES = [
  "GOAT", "WIF", "MOOG", "PNUT", "CHILLZ", "RETIRE", "FWOG", "ZYN",
  "GIGA", "SLOP", "BONKD", "MOODENG", "WAGYU", "TETSUO", "DUKO", "SIGMA",
];

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(items: T[]) => items[(Math.random() * items.length) | 0];
const marketCap = () => {
  const value = randomBetween(4, 900);
  return value >= 100 ? `${value | 0}k` : `${value.toFixed(1)}k`;
};

function TickerRail() {
  const cells = Array.from({ length: 16 }, () => {
    const roll = Math.random();
    if (roll < 0.42) {
      return { kind: "up", action: "▲ BUY", amount: `${randomBetween(0.05, 3).toFixed(2)} SOL`, token: pick(NAMES), detail: `mc $${marketCap()}` };
    }
    if (roll < 0.8) {
      return { kind: "dn", action: "▼ SELL", amount: `${randomBetween(0.05, 3).toFixed(2)} SOL`, token: pick(NAMES), detail: `mc $${marketCap()}` };
    }
    return { kind: "nw", action: "＋ CREATE", amount: "", token: pick(NAMES), detail: "curve 0%" };
  });

  return (
    <>
      {[...cells, ...cells].map((cell, index) => (
        <span data-index={index}>
          <b className={cell.kind}>{cell.action}</b>{cell.amount ? ` ${cell.amount} · ` : " "}
          <b>${cell.token}</b> · {cell.detail}
        </span>
      ))}
    </>
  );
}

function formatVolume(value: number) {
  if (value >= 1000) return `$${(value / 1000).toFixed(value % 1000 ? 1 : 0)}M`;
  return `$${value}k`;
}

function FeeCalculator({ value, update }: { value: number; update: (next: number) => void }) {
  const yearlyFee = Math.round(value * 1000 * 0.01 * 12).toLocaleString("en-US");
  return (
    <>
      <label for="vol">your monthly volume</label>
      <input
        type="range"
        id="vol"
        min={10}
        max={1000}
        step={10}
        value={value}
        onInput={(event: Event) => update(Number((event.currentTarget as HTMLInputElement).value))}
      />
      <div className="out">
        at <b>{formatVolume(value)}</b>/mo, a 1% bot costs <b>${yearlyFee}</b>/yr · <span className="grn">solard: $0</span>
      </div>
    </>
  );
}

function setupTicker() {
  const root = document.getElementById("ticker-root");
  if (!root) return () => {};
  render(<TickerRail />, root);
  return () => render(null, root);
}

function setupFeeCalculator() {
  const root = document.getElementById("fee-calculator-root");
  if (!root) return () => {};
  let value = 100;
  const update = (next: number) => {
    value = next;
    render(<FeeCalculator value={value} update={update} />, root);
  };
  update(value);
  return () => render(null, root);
}

function setupCopyButtons() {
  const cleanups: Array<() => void> = [];
  document.querySelectorAll<HTMLButtonElement>(".cmd button").forEach((button) => {
    const click = async () => {
      const text = button.dataset.copy ?? "";
      try {
        await navigator.clipboard.writeText(text);
        button.textContent = "copied";
      } catch {
        button.textContent = "copy failed";
      }
      window.setTimeout(() => { button.textContent = "copy"; }, 1200);
    };
    button.addEventListener("click", click);
    cleanups.push(() => button.removeEventListener("click", click));
  });
  return () => cleanups.forEach((cleanup) => cleanup());
}

function setupWordmark(reduceMotion: boolean) {
  if (reduceMotion) return () => {};
  const element = document.getElementById("wordmark");
  if (!element) return () => {};
  const target = element.dataset.text ?? "SOLARD";
  const glyphs = "▓▒░◤◢#%&$0123456789";
  let frame = 0;
  const timer = window.setInterval(() => {
    frame += 1;
    element.textContent = [...target].map((letter, index) => (
      frame > index * 4 + 8 ? letter : glyphs[(Math.random() * glyphs.length) | 0]
    )).join("");
    if (frame > target.length * 4 + 8) {
      element.textContent = target;
      window.clearInterval(timer);
    }
  }, 40);
  return () => window.clearInterval(timer);
}

function setupBootTerminal(reduceMotion: boolean) {
  const element = document.getElementById("boot");
  if (!element) return () => {};
  const timers = new Set<number>();
  let disposed = false;
  const maxLines = 15;
  const schedule = (callback: () => void, delay: number) => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      if (!disposed) callback();
    }, delay);
    timers.add(id);
  };
  const push = (html: string) => {
    const line = document.createElement("span");
    line.className = "bl";
    line.innerHTML = html;
    element.appendChild(line);
    while (element.children.length > maxLines) element.firstElementChild?.remove();
  };
  const workers = [
    ["solard-server-worker", "online"],
    ["solard-helius-logs-v1", "streaming"],
    ["solard-helius-laserstream-v1", "streaming"],
    ["solard-pumpportal-live-v2", "streaming"],
    ["solard-curve-snapshots", "sampling"],
    ["solard-holder-snapshots", "sampling"],
    ["solard-reconciler", "watching"],
  ].map(([name, status]) => `<span class="k">▸</span> ${name} <span class="k">${".".repeat(Math.max(2, 30 - name.length - status.length))}</span> <span class="ok">${status}</span>`);
  const gate = '<span class="k">live trades:</span> <span class="ok">disabled</span> <span class="k">(SOLARD_ENABLE_LIVE_TRADES=0)</span>';
  const url = '<span class="k">console:</span> <span class="u">http://localhost:3000</span>';
  const timestamp = () => new Date().toLocaleTimeString("en-GB", { hour12: false });
  const feedLine = () => {
    const token = pick(NAMES);
    const roll = Math.random();
    if (roll < 0.14) return `<span class="k">${timestamp()}</span> <span class="y">＋ create</span> $${token} <span class="k">curve 0% · pump</span>`;
    if (roll < 0.6) return `<span class="k">${timestamp()}</span> <span class="ok">▲ buy</span> ${randomBetween(0.05, 2.5).toFixed(2)} SOL $${token} <span class="k">mc $${marketCap()}</span>`;
    if (roll < 0.94) return `<span class="k">${timestamp()}</span> <span class="bad">▼ sell</span> ${randomBetween(0.05, 2.5).toFixed(2)} SOL $${token} <span class="k">mc $${marketCap()}</span>`;
    return `<span class="k">${timestamp()}</span> <span class="k">◆ snapshot</span> $${token} <span class="k">holders ${randomBetween(40, 900) | 0} · top10 ${randomBetween(12, 55).toFixed(1)}%</span>`;
  };
  const live = () => {
    push(feedLine());
    schedule(live, reduceMotion ? 1800 : randomBetween(280, 1400));
  };

  element.textContent = "";
  push('<span class="k">$ bun bin/solard.ts start --open</span>');
  if (reduceMotion) {
    workers.forEach(push);
    push("&nbsp;");
    push(gate);
    push(url);
    live();
  } else {
    let index = 0;
    const step = () => {
      if (index < workers.length) {
        push(workers[index++]);
        schedule(step, 220 + Math.random() * 200);
      } else {
        push("&nbsp;");
        push(gate);
        push(url);
        push("&nbsp;");
        schedule(live, 700);
      }
    };
    schedule(step, 450);
  }

  return () => {
    disposed = true;
    timers.forEach((id) => window.clearTimeout(id));
    timers.clear();
  };
}

function setupObservers() {
  if (!("IntersectionObserver" in window)) {
    document.querySelectorAll(".rv").forEach((node) => node.classList.add("in"));
    return () => {};
  }
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });
  document.querySelectorAll(".rv").forEach((node) => revealObserver.observe(node));

  const links = [...document.querySelectorAll<HTMLAnchorElement>(".nav-links a[data-s]")];
  const sections = links.map((link) => document.getElementById(link.dataset.s ?? "")).filter(Boolean) as HTMLElement[];
  const navObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        links.forEach((link) => link.classList.toggle("on", link.dataset.s === entry.target.id));
      }
    });
  }, { rootMargin: "-30% 0px -60% 0px" });
  sections.forEach((section) => navObserver.observe(section));
  return () => {
    revealObserver.disconnect();
    navObserver.disconnect();
  };
}

type WalletLine = {
  values: Float32Array;
  color: string;
  category: "w" | "a" | "d" | "e" | "c";
  last: number;
  address: string;
};

function setupDistributionChart() {
  const canvas = document.getElementById("mini") as HTMLCanvasElement | null;
  const tip = document.getElementById("tip");
  const shell = canvas?.parentElement;
  const context = canvas?.getContext("2d");
  if (!canvas || !tip || !shell || !context) return () => {};

  const cap = 2;
  const timePoints = 90;
  const lineCount = 90;
  let seed = 7;
  const seeded = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const clamp = (value: number, min: number, max: number) => value < min ? min : value > max ? max : value;
  const wallets: WalletLine[] = [];

  for (let index = 0; index < lineCount; index += 1) {
    const roll = seeded();
    const category: WalletLine["category"] = roll < 0.06 ? "w" : roll < 0.24 ? "a" : roll < 0.42 ? "d" : roll < 0.55 ? "e" : "c";
    const values = new Float32Array(timePoints);
    const hue = (seeded() * 360) | 0;
    let value = 0;
    if (category === "w") {
      value = 1.2 + seeded() * 0.6;
      for (let time = 0; time < timePoints; time += 1) { value = clamp(value + (seeded() - 0.48) * 0.02, 0.9, cap); values[time] = value; }
    } else if (category === "a") {
      value = 0.05 + seeded() * 0.2;
      const rate = 0.006 + seeded() * 0.015;
      for (let time = 0; time < timePoints; time += 1) { value = clamp(value + rate, 0, cap); values[time] = value; }
    } else if (category === "d") {
      value = 0.6 + seeded();
      const rate = 0.006 + seeded() * 0.016;
      for (let time = 0; time < timePoints; time += 1) { value = clamp(value - rate, 0, cap); values[time] = value; }
    } else if (category === "e") {
      const start = (seeded() * timePoints * 0.6) | 0;
      let holding = 0;
      for (let time = 0; time < timePoints; time += 1) {
        if (time < start) values[time] = 0;
        else { holding = clamp(holding + 0.01 + seeded() * 0.012, 0, cap); values[time] = holding; }
      }
    } else {
      value = seeded() * 0.3;
      for (let time = 0; time < timePoints; time += 1) { value = clamp(value + (seeded() - 0.5) * 0.03, 0, 0.5); values[time] = value; }
    }
    const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const address = Array.from({ length: 4 }, () => alphabet[(seeded() * alphabet.length) | 0]).join("");
    wallets.push({
      values,
      color: `hsl(${hue} ${category === "c" ? 40 : 60}% ${category === "w" ? 60 : category === "c" ? 40 : 54}%)`,
      category,
      last: values[timePoints - 1],
      address: `${address}…${address.slice(0, 3)}`,
    });
  }
  wallets.sort((a, b) => a.last - b.last);

  let hot = -1;
  let width = 0;
  let height = 0;
  const draw = () => {
    const dpr = window.devicePixelRatio || 1;
    const rect = shell.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    width = rect.width;
    height = rect.height;
    context.clearRect(0, 0, width, height);
    for (let grid = 1; grid < 4; grid += 1) {
      context.strokeStyle = "#111";
      context.lineWidth = 1;
      const y = (grid / 4) * height;
      context.beginPath(); context.moveTo(0, y + 0.5); context.lineTo(width, y + 0.5); context.stroke();
    }
    context.lineJoin = "round";
    context.lineCap = "round";
    const xAt = (time: number) => (time / (timePoints - 1)) * width;
    const yAt = (value: number) => (1 - value / cap) * height;
    wallets.forEach((wallet, index) => {
      if (index === hot) return;
      context.globalAlpha = hot >= 0 ? 0.12 : wallet.category === "c" ? 0.3 : 0.75;
      context.strokeStyle = wallet.color;
      context.lineWidth = 1;
      context.beginPath();
      for (let time = 0; time < timePoints; time += 1) {
        const x = xAt(time); const y = yAt(wallet.values[time]);
        time ? context.lineTo(x, y) : context.moveTo(x, y);
      }
      context.stroke();
    });
    if (hot >= 0) {
      const wallet = wallets[hot];
      context.globalAlpha = 1;
      context.strokeStyle = "#fff";
      context.lineWidth = 1.6;
      context.beginPath();
      for (let time = 0; time < timePoints; time += 1) {
        const x = xAt(time); const y = yAt(wallet.values[time]);
        time ? context.lineTo(x, y) : context.moveTo(x, y);
      }
      context.stroke();
    }
    context.globalAlpha = 1;
  };
  const nearest = (mouseX: number, mouseY: number) => {
    const time = clamp(Math.round((mouseX / width) * (timePoints - 1)), 0, timePoints - 1);
    let best = -1;
    let bestDistance = 14;
    wallets.forEach((wallet, index) => {
      const y = (1 - wallet.values[time] / cap) * height;
      const distance = Math.abs(y - mouseY);
      if (distance < bestDistance) { bestDistance = distance; best = index; }
    });
    return best;
  };
  const move = (event: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const index = nearest(event.clientX - rect.left, event.clientY - rect.top);
    if (index !== hot) { hot = index; draw(); }
    if (hot >= 0) {
      const wallet = wallets[hot];
      const current = wallet.values[timePoints - 1];
      const previous = wallet.values[timePoints - 25] || 0;
      const delta = current - previous;
      tip.innerHTML = `<b>${wallet.address}</b> · ${current.toFixed(2)}% of supply · 24h <span class="${delta >= 0 ? "up" : "dn"}">${delta >= 0 ? "+" : ""}${delta.toFixed(2)}%</span>`;
      tip.style.opacity = "1";
    } else tip.style.opacity = "0";
  };
  const leave = () => { hot = -1; tip.style.opacity = "0"; draw(); };
  const resize = () => { hot = -1; draw(); };
  shell.addEventListener("mousemove", move);
  shell.addEventListener("mouseleave", leave);
  window.addEventListener("resize", resize);
  draw();
  return () => {
    shell.removeEventListener("mousemove", move);
    shell.removeEventListener("mouseleave", leave);
    window.removeEventListener("resize", resize);
  };
}

export default function mount() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cleanups = [
    setupTicker(),
    setupFeeCalculator(),
    setupCopyButtons(),
    setupWordmark(reduceMotion),
    setupBootTerminal(reduceMotion),
    setupObservers(),
    setupDistributionChart(),
  ];
  return () => cleanups.reverse().forEach((cleanup) => cleanup());
}
