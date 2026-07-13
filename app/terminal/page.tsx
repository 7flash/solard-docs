import { Head } from "tradjs/web";

export const ssg = true;

export default function TerminalPage() {
  return (
    <>
      <Head>
        <title>SOLARD — flow terminal</title>
        <meta
          name="description"
          content="Interactive sample of the SOLARD local trading terminal and holder-flow dashboard."
        />
        <meta property="og:title" content="SOLARD — flow terminal" />
      </Head>
      <main className="terminal-page">
        <div className="wrap">
          <a className="back" href="/">
            ← back to landing
          </a>
          <div className="terminal-top">
            <div>
              <div className="tag">sample local console</div>
              <h1>FLOW TERMINAL</h1>
            </div>
            <div className="terminal-actions" id="terminal-controls" />
          </div>
          <div id="terminal-dashboard" />
        </div>
      </main>
    </>
  );
}
