import { render } from "tradjs/client";
import { mountSolardApp, unmountSolardApp } from "../../src/app";
import { traceLabel } from "../../src/observability/action";
import {
  clientMeasure,
  installClientObservability,
} from "../../src/observability/client";

export default function mount() {
  const cleanupObservability = installClientObservability();
  const root = document.getElementById("app-root");
  if (!root) {
    void clientMeasure
      .root("Mount SOLARD page", async () => {
        throw new Error("Missing #app-root mount element.");
      })
      .catch(() => undefined);
    return cleanupObservability;
  }

  clientMeasure.note(
    traceLabel("Mount SOLARD page", {
      root: "#app-root",
      build: "5.4.0",
      feed: "polling",
    }),
  );
  mountSolardApp(root, render);
  return () => {
    clientMeasure.note("Unmount SOLARD page");
    unmountSolardApp(root, render);
    cleanupObservability();
  };
}
