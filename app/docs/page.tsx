import { Head } from "tradjs/web";
import { docsHtml } from "./content";

export const ssg = true;

export default function DocsPage() {
  return (
    <>
      <Head>
        <title>SOLARD — documentation</title>
        <meta
          name="description"
          content="SOLARD documentation for the TradJS console, solard CLI, configuration, workers, Pump and PumpSwap venues, senders, live token streaming, launch workflows, SDK, and safety."
        />
        <meta property="og:title" content="SOLARD — documentation" />
        <meta
          property="og:description"
          content="Quickstart and reference documentation for SOLARD."
        />
      </Head>
      <div
        className="docs-page"
        dangerouslySetInnerHTML={{ __html: docsHtml }}
      />
    </>
  );
}
