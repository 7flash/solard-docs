export type ErrorRecord = {
  name: string;
  message: string;
  code?: string | number;
  data?: unknown;
  stack?: string;
  cause?: ErrorRecord;
};

function objectValue(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  return (value as Record<string, unknown>)[key];
}

export function errorRecord(error: unknown, depth = 0): ErrorRecord {
  const messageValue = objectValue(error, "message");
  const nameValue = objectValue(error, "name");
  const codeValue = objectValue(error, "code");
  const dataValue = objectValue(error, "data");
  const stackValue = objectValue(error, "stack");
  const causeValue = objectValue(error, "cause");

  const message =
    typeof messageValue === "string" && messageValue.trim()
      ? messageValue.trim()
      : error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : (() => {
              try {
                return JSON.stringify(error);
              } catch {
                return String(error);
              }
            })();

  const record: ErrorRecord = {
    name:
      typeof nameValue === "string" && nameValue
        ? nameValue
        : error instanceof Error
          ? error.name
          : "Error",
    message: message || "Unknown error",
  };

  if (typeof codeValue === "string" || typeof codeValue === "number")
    record.code = codeValue;
  if (dataValue !== undefined) record.data = dataValue;
  if (typeof stackValue === "string" && stackValue) record.stack = stackValue;
  if (causeValue !== undefined && depth < 3)
    record.cause = errorRecord(causeValue, depth + 1);
  return record;
}

export function errorCode(error: unknown): string | number | undefined {
  const record = errorRecord(error);
  if (record.code !== undefined) return record.code;
  return record.cause?.code;
}

export function errorMessage(error: unknown): string {
  const record = errorRecord(error);
  return record.cause?.message || record.message;
}
