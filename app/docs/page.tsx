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
          content="Solard documentation: quickstart, architecture, CLI reference, web console, venues and routing, launching, scripts, and AI agent integration."
        />
        <meta property="og:title" content="SOLARD — documentation" />
        <meta
          property="og:description"
          content="Quickstart, CLI, web console, direct venues, launching, scripts, agents, API, environment, and safety."
        />
      </Head>
      <div
        className="docs-page"
        dangerouslySetInnerHTML={{ __html: docsHtml }}
      />
    </>
  );
}
