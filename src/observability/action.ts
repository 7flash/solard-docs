export type TraceFields = Record<string, unknown>;

function renderField(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string")
    return /\s/.test(value) ? JSON.stringify(value) : value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(renderField).join(",")}]`;
  try {
    const text = JSON.stringify(value);
    return text.length > 180 ? `${text.slice(0, 177)}...` : text;
  } catch {
    return String(value);
  }
}

/** Build a compact, deterministic label for measure-fn spans and notes. */
export function traceLabel(label: string, fields: TraceFields = {}): string {
  const suffix = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${renderField(value)}`)
    .join(" ");
  return suffix ? `${label} (${suffix})` : label;
}
