export const ssg = true;

export default function TerminalPage() {
  return (
    <main className="terminal-page">
      <div className="wrap">
        <a className="back" href="/">← back to landing</a>
        <div className="terminal-top">
          <div><div className="tag">sample local console</div><h1>FLOW TERMINAL</h1></div>
          <div className="terminal-actions" id="terminal-controls" />
        </div>
        <div id="terminal-dashboard" />
      </div>
    </main>
  );
}
