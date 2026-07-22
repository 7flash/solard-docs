import { configure, createMeasure } from "measure-fn";
import { errorRecord } from "./error";

configure({
  maxResultLength: 280,
  summarize: true,
  stripScopePrefix: true,
});

/** measure-fn 5.x callable scope. Nested work calls this same closure-aware function. */
export const serverMeasure = createMeasure("server");

export const serverMeasureCapabilities = Object.freeze({
  version: 5,
  callableScope: true,
  closureTracking: true,
  callbackMeasureArgument: false,
});

export function serverErrorResponse(error: unknown, status = 500): Response {
  const detail = errorRecord(error);
  return Response.json(
    { ok: false, error: detail.message, code: detail.code ?? null },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
