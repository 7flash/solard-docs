export function bigintFromUnknown(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string") return BigInt(value);
  if (value && typeof value === "object" && "toString" in value) {
    return BigInt(String((value as { toString(): string }).toString()));
  }
  return 0n;
}

export function numberFromUnknown(value: unknown): number {
  if (typeof value === "number") return value;
  return Number(bigintFromUnknown(value));
}

export function parseTokenAmount(input: string, decimals: number): bigint {
  const trimmed = input.trim();
  if (!/^\d*(?:\.\d*)?$/.test(trimmed) || trimmed === "" || trimmed === ".") {
    throw new Error("Enter a valid collateral amount.");
  }
  const [whole = "0", fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) {
    throw new Error(`Collateral supports at most ${decimals} decimal places.`);
  }
  const padded = fraction.padEnd(decimals, "0");
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

export function formatToken(
  raw: bigint,
  decimals: number,
  maximumFractionDigits = 4,
): string {
  const negative = raw < 0n;
  const value = negative ? -raw : raw;
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = value % scale;
  if (decimals === 0 || maximumFractionDigits === 0)
    return `${negative ? "−" : ""}${whole}`;
  const shown = fraction
    .toString()
    .padStart(decimals, "0")
    .slice(0, maximumFractionDigits)
    .replace(/0+$/, "");
  return `${negative ? "−" : ""}${whole.toLocaleString()}${shown ? `.${shown}` : ""}`;
}

export function formatPriceE6(raw: bigint, maximumFractionDigits = 6): string {
  return formatToken(raw, 6, maximumFractionDigits);
}

export function formatCompact(raw: bigint, decimals: number): string {
  const numeric = Number(raw) / 10 ** decimals;
  if (!Number.isFinite(numeric)) return "—";
  const abs = Math.abs(numeric);
  const sign = numeric < 0 ? "−" : "";
  if (abs >= 1_000_000_000)
    return `${sign}${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(2)}K`;
  return formatToken(raw, decimals, 4);
}

export function shortAddress(
  value: { toBase58(): string } | string,
  head = 4,
  tail = 4,
): string {
  const text = typeof value === "string" ? value : value.toBase58();
  if (text.length <= head + tail + 1) return text;
  return `${text.slice(0, head)}…${text.slice(-tail)}`;
}

export function bpsToPercent(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
}

export function bpsToLeverage(bps: number): string {
  const leverage = bps / 10_000;
  return `${Number.isInteger(leverage) ? leverage.toFixed(0) : leverage.toFixed(2)}x`;
}

export function unixAgo(blockTime: number | null): string {
  if (!blockTime) return "pending";
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - blockTime);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

export function clampBigint(value: bigint, min: bigint, max: bigint): bigint {
  return value < min ? min : value > max ? max : value;
}

export function safePercent(numerator: bigint, denominator: bigint): number {
  if (denominator === 0n) return 0;
  return Number((numerator * 10_000n) / denominator) / 100;
}

export function eventValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "ON" : "OFF";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint")
    return String(value);
  if (Array.isArray(value)) return value.map(eventValue).join(", ");
  if (typeof value === "object") {
    const maybeKey = value as {
      toBase58?: () => string;
      toString?: () => string;
    };
    if (maybeKey.toBase58) return maybeKey.toBase58();
    if (maybeKey.toString) return maybeKey.toString();
  }
  return String(value);
}
